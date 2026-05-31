# Implementation Plan

> Builds on `goals.md`, `architecture.md`, and `design.md`, which are assumed to be in context. This document gives the exact files, signatures, configuration, and steps to implement and deploy v1. It does not restate the rationale or behaviour covered in the other documents.

## Stack

- **Runtime:** Cloudflare Workers (V8 isolate).
- **Language:** TypeScript.
- **Tooling:** Wrangler (CLI), scaffolded with C3 (`create-cloudflare`). Node 20 LTS recommended (Wrangler requires 16.17+).
- **Dependencies:** none beyond what C3 generates. No web framework, no Telegram SDK. Raw `fetch` only.
- **LLM provider:** Anthropic Messages API, isolated in `src/llm.ts`. Default model `claude-haiku-4-5-20251001` (fast and inexpensive, ample for phrase translation). The model string is configurable in one place; verify the current recommended string in Anthropic's docs at deploy time.

## Project layout

```
translate-bot/
  src/
    index.ts        # fetch handler: routing, auth gating, dispatch, reply, always-200
    auth.ts         # secret-token + chat allowlist predicates
    dispatch.ts     # the 4-step decision tree -> Action
    prompts.ts      # the two system prompts + refine user-message builder
    llm.ts          # translate(systemPrompt, userText, env) -> string  (Anthropic)
    telegram.ts     # sendMessage(...)
    types.ts        # Env + Telegram update slice + Action union
  wrangler.jsonc
  .dev.vars         # local-only secrets, gitignored
  .gitignore
  package.json      # from C3
  tsconfig.json     # from C3
```

## Types — `src/types.ts`

```ts
export interface Env {
  BOT_TOKEN: string;       // secret
  LLM_API_KEY: string;     // secret
  WEBHOOK_SECRET: string;  // secret
  ALLOWED_CHAT_ID: string; // var, numeric string e.g. "-1001234567890"
}

export interface TgFrom { id: number; is_bot: boolean; }
export interface TgChat { id: number; type: string; }

export interface TgMessage {
  message_id: number;
  text?: string;
  chat: TgChat;
  from?: TgFrom;
  reply_to_message?: {
    message_id: number;
    text?: string;
    from?: TgFrom;
  };
}

export interface TgUpdate { message?: TgMessage; }

export type Action =
  | { kind: "ignore" }
  | { kind: "fresh";  text: string;     replyTo: number }
  | { kind: "refine"; previous: string; instruction: string; replyTo: number };
```

## Auth — `src/auth.ts`

Two separate predicates: a missing/wrong secret header means a non-Telegram caller and returns `401`; a wrong chat means a silently-ignored (`200`) update.

```ts
import type { Env, TgUpdate } from "./types";

export function hasValidSecret(request: Request, env: Env): boolean {
  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === env.WEBHOOK_SECRET;
}

export function isAllowedChat(update: TgUpdate, env: Env): boolean {
  return update.message?.chat.id === Number(env.ALLOWED_CHAT_ID);
}
```

## Dispatch — `src/dispatch.ts`

Implements the 4-step tree from `design.md`. Uses `trimStart()` for the sentinel check so leading whitespace before `,`/`.` is still recognized; the original text is passed through for translation.

```ts
import type { Action, TgUpdate } from "./types";

export function decide(update: TgUpdate, botId: number): Action {
  const msg = update.message;
  if (!msg || !msg.text) return { kind: "ignore" };

  const text = msg.text;
  const head = text.trimStart();
  if (head.startsWith(",") || head.startsWith(".")) return { kind: "ignore" };

  const reply = msg.reply_to_message;
  if (reply && reply.from?.id === botId && reply.text) {
    return {
      kind: "refine",
      previous: reply.text,
      instruction: text,
      replyTo: msg.message_id,
    };
  }

  return { kind: "fresh", text, replyTo: msg.message_id };
}
```

## Prompts — `src/prompts.ts`

The exact strings are an implementation artifact; `design.md` specifies what they must achieve.

```ts
export const FRESH_SYSTEM_PROMPT =
  "You are a translation engine for English and Russian. " +
  "Detect the language of the user's text. If it is English, translate it to Russian. " +
  "If it is Russian, translate it to English. Preserve tone and register. " +
  "Output only the translation — no preamble, no quotation marks, no notes, no alternatives.";

export const REFINE_SYSTEM_PROMPT =
  "You adjust an existing translation. You are given a previous translation and an " +
  "adjustment instruction. Apply the instruction and return the revised text in the " +
  "same language as the previous translation. " +
  "Output only the revised text — no preamble, no quotation marks, no notes.";

export function refineUserMessage(previous: string, instruction: string): string {
  return `Previous translation:\n${previous}\n\nAdjustment:\n${instruction}`;
}
```

## LLM — `src/llm.ts`

The only provider-aware module. Returns the concatenated text blocks, trimmed. Throws on a non-OK response so the caller's catch can report into the chat.

```ts
import type { Env } from "./types";

const MODEL = "claude-haiku-4-5-20251001";

export async function translate(
  systemPrompt: string,
  userText: string,
  env: Env,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.LLM_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!res.ok) throw new Error(`LLM error ${res.status}`);

  const data: any = await res.json();
  const out = (data.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();

  if (!out) throw new Error("LLM returned empty text");
  return out;
}
```

## Telegram — `src/telegram.ts`

```ts
import type { Env } from "./types";

export async function sendMessage(
  chatId: number,
  text: string,
  replyToMessageId: number,
  env: Env,
): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
      }),
    },
  );

  if (!res.ok) throw new Error(`Telegram error ${res.status}`);
}
```

## Entry — `src/index.ts`

Owns routing, the auth gates, dispatch, the reply, and the always-`200` contract. The bot's own ID is derived from the token prefix. The reply target is taken from the inbound message's chat.

```ts
import type { Env, TgUpdate } from "./types";
import { hasValidSecret, isAllowedChat } from "./auth";
import { decide } from "./dispatch";
import { FRESH_SYSTEM_PROMPT, REFINE_SYSTEM_PROMPT, refineUserMessage } from "./prompts";
import { translate } from "./llm";
import { sendMessage } from "./telegram";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Routing: only the webhook POST is handled; everything else is a health response.
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("ok");
    }

    // Perimeter 1: secret header. A failure here is a non-Telegram caller.
    if (!hasValidSecret(request, env)) {
      return new Response("unauthorized", { status: 401 });
    }

    // Parse.
    let update: TgUpdate;
    try {
      update = await request.json();
    } catch {
      return new Response("ok");
    }

    // Perimeter 2: chat allowlist. Wrong chat is silently ignored.
    if (!isAllowedChat(update, env)) return new Response("ok");

    // Decide.
    const botId = Number(env.BOT_TOKEN.split(":")[0]);
    const action = decide(update, botId);
    if (action.kind === "ignore") return new Response("ok");

    const chatId = update.message!.chat.id;

    // Translate + reply. Always 200, even on failure.
    try {
      const result =
        action.kind === "fresh"
          ? await translate(FRESH_SYSTEM_PROMPT, action.text, env)
          : await translate(
              REFINE_SYSTEM_PROMPT,
              refineUserMessage(action.previous, action.instruction),
              env,
            );

      await sendMessage(chatId, result, action.replyTo, env);
    } catch (_err) {
      try {
        await sendMessage(chatId, "⚠️ Translation failed — please try again.", action.replyTo, env);
      } catch {
        // Reporting failed too; nothing more to do. Still return 200.
      }
    }

    return new Response("ok");
  },
};
```

## Configuration

`wrangler.jsonc` — `ALLOWED_CHAT_ID` is filled in after the group id is discovered (see bootstrap step 4):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "translate-bot",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-29",
  "vars": {
    "ALLOWED_CHAT_ID": ""
  },
  "observability": { "enabled": true }
}
```

`.dev.vars` — local-only secrets for `wrangler dev`, never committed:

```
BOT_TOKEN=123456:your-token
LLM_API_KEY=sk-ant-...
WEBHOOK_SECRET=some-long-random-string
```

`.gitignore` — ensure it contains:

```
node_modules
dist
.wrangler
.dev.vars
```

## Build and deploy steps

1. **Scaffold:** `npm create cloudflare@latest translate-bot` → choose *Hello World example* → *Worker only* → *TypeScript*. Keep the generated `package.json` / `tsconfig.json`.
2. **Add source:** replace the generated entry with the modules above; write `wrangler.jsonc`.
3. **Set deployed secrets** (encrypted in Cloudflare):
   ```
   wrangler secret put BOT_TOKEN
   wrangler secret put LLM_API_KEY
   wrangler secret put WEBHOOK_SECRET
   ```
   Create `.dev.vars` for local runs with the same three values.
4. **Deploy:** `wrangler deploy`. Note the resulting URL, `https://translate-bot.<subdomain>.workers.dev`. (Rollback to a prior version is available from the dashboard if needed.)

## One-time bootstrap (after first deploy)

1. **Create the bot** with BotFather (`/newbot`) if not already done; this yields `BOT_TOKEN`.
2. **Disable privacy:** BotFather → `/mybots` → the bot → *Bot Settings* → *Group Privacy* → **Turn off**. Then **remove the bot from the group and re-add it** — privacy-off only takes effect on re-add.
3. **Discover the group `chat_id`** (chicken-and-egg: the allowlist needs it, but it only appears in a real update). Temporarily add `console.log(update.message?.chat.id)` near the top of the handler, deploy, send one message in the group, read the id from `wrangler tail`, put it into `ALLOWED_CHAT_ID`, redeploy, and remove the log line. (Group ids are negative.)
4. **Register the webhook**, binding the secret in the same call:
   ```
   curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://translate-bot.<subdomain>.workers.dev/webhook&secret_token=<WEBHOOK_SECRET>"
   ```
   Verify with `https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`.

## Testing

**Logic, locally.** Run `wrangler dev` and POST hand-written updates. For these local runs, set `ALLOWED_CHAT_ID` in `.dev.vars` to match the `chat.id` in the payload, and send the matching secret header. (Note the LLM and Telegram calls are real; for pure dispatch testing, temporarily log the decided `action` before the LLM call.)

Fresh translation:
```
curl -X POST http://localhost:8787/webhook \
  -H "content-type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>" \
  -d '{"message":{"message_id":10,"text":"How are you?","chat":{"id":-100123,"type":"supergroup"},"from":{"id":111,"is_bot":false}}}'
```

Refine (replied-to message is from the bot — set `from.id` to the bot's numeric id, i.e. the token prefix):
```
curl -X POST http://localhost:8787/webhook \
  -H "content-type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>" \
  -d '{"message":{"message_id":11,"text":"more formal","chat":{"id":-100123,"type":"supergroup"},"from":{"id":111,"is_bot":false},"reply_to_message":{"message_id":10,"text":"Как дела?","from":{"id":123456,"is_bot":true}}}}'
```

Ignore cases to confirm: a message with no `text`; a message whose text starts with `,` or `.`; a message from a non-allowed `chat.id`; a request with a missing/wrong secret header (expect `401`).

**Integration, deployed.** Use the real bot in the group and watch `wrangler tail` for live logs. Confirm: a phrase round-trips both directions; the reply is threaded to the source message; a reply to the bot refines its previous output; a `.`/`,` message is ignored; and a forced LLM error produces the in-chat error message while the request still returns `200`.

## Acceptance criteria

- [ ] English phrase → Russian translation; Russian phrase → English translation; reply threaded to the source.
- [ ] Reply to a bot message with an instruction returns the adjusted text in the same language.
- [ ] Messages beginning with `,` or `.` are ignored.
- [ ] Non-text messages and service messages are ignored without an LLM call.
- [ ] Updates from any chat other than `ALLOWED_CHAT_ID` are ignored; requests without the correct secret header get `401`.
- [ ] LLM or Telegram failure yields an in-chat error and still returns `200` (no Telegram retry / duplicate).
- [ ] No secrets are committed; the three secrets are set via `wrangler secret put`.
