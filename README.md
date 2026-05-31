# English Breakfast — Telegram Translation Bot

A stateless Cloudflare Worker that silently translates messages in a private Telegram group, toggling between English and Russian. Send any phrase and the bot replies in the other language, threaded to the original message. Reply to a bot reply with an instruction (e.g. "more formal") to refine the translation in place. Messages that begin with `.` or `,` are treated as human asides and ignored. Full design rationale and acceptance criteria are in [specs/](specs/).

## Module Map

| File | Responsibility |
|---|---|
| `src/index.ts` | Fetch handler: routing, auth checks, orchestration, always-200 error catch |
| `src/auth.ts` | `hasValidSecret` (WEBHOOK_SECRET header) + `isAllowedChat` (chat allowlist) |
| `src/dispatch.ts` | `decide()` — classifies an update as `ignore`, `fresh`, or `refine` |
| `src/prompts.ts` | System prompts and `refineUserMessage` builder for the LLM |
| `src/llm.ts` | Anthropic Messages API call (claude-haiku-4-5-20251001) |
| `src/telegram.ts` | `sendMessage` — posts a threaded reply via Telegram Bot API |
| `src/types.ts` | Shared TypeScript types (`Env`, `TgUpdate`, `Action`) |

## Development Commands

```
npm install          # install dependencies
npm test             # run unit tests (vitest)
npm run typecheck    # TypeScript type check (tsc --noEmit)
npx wrangler dev     # local dev server (requires .dev.vars — see DEPLOY.md)
```

## Local Dev

Copy `.dev.vars.example` to `.dev.vars`, fill in the three secrets and `ALLOWED_CHAT_ID`, then run `npx wrangler dev`. See the **Local development** section in [DEPLOY.md](DEPLOY.md) for example `curl` payloads.

## Deploy

See [DEPLOY.md](DEPLOY.md) for the full step-by-step runbook, including Cloudflare auth, secret management, webhook registration, and smoke testing.
