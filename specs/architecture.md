# Architecture

> Realizes the experience described in `goals.md`.

## Delivery channel: a Telegram group

The product is delivered as a **Telegram bot in a dedicated group chat** containing the two users and the bot. This satisfies the core constraints directly: Telegram already runs on every phone with no per-device setup, a group is inherently shared and keeps a visible history, and a bot can read and reply within it. The group *is* the tool — it carries no other conversation.

## Hosting model: serverless webhook

The bot is **stateless and event-driven** — it only needs to act when a message arrives — so it needs no always-on server. It runs on **Cloudflare Workers**, invoked per message via a **webhook**.

- **Webhook, not long-polling.** Telegram POSTs each update to the Worker's URL. There is no polling loop and therefore no process to keep alive — the prerequisite both for going serverless and for the zero-cost goal.
- **Cloudflare Workers.** Runs as a V8 isolate at the edge: no cold-start penalty, low latency, and a free tier far larger than two people will ever consume. Running cost is effectively zero; the only per-use cost is the language-model call.
- **Stateless (v1).** Translation direction is auto-detected by the model, so there is nothing to persist — no database, no key-value store. The whole system stays a single deployable script.

## Component view

```
[Telegram app]  →  [Telegram Bot API]  →  [Cloudflare Worker]  →  [LLM API]
  user / wife        Telegram's infra        our code           Anthropic / OpenAI
```

Only the Worker is ours. Telegram provides the client, the transport, and message delivery; the LLM provider performs the translation; the Worker is the glue that authenticates the request, decides what to do, calls the model, and replies.

## Request lifecycle (per message)

1. A user sends a phrase in the group.
2. Telegram POSTs an `Update` (message text, sender, chat) to the Worker's webhook URL.
3. The Worker **authenticates** the request (see Security boundary).
4. It **decides** what the message means — translate, refine, or ignore.
5. On translate or refine it calls the **LLM** with the appropriate prompt.
6. It **replies** into the group via Telegram's `sendMessage`, attached to the triggering message.
7. It returns `200`.

The model picks between two behaviours — a fresh translation or a refinement of a previous result — based on the message. The detailed rules live in `design.md`.

## Security boundary

The Worker URL is public and holds the LLM API key, so two gates protect it:

- **Webhook secret token.** Registered with Telegram and returned in a header on every update; the Worker rejects anything without it. This stops arbitrary callers POSTing to the URL.
- **Group allowlist.** The Worker ignores any update whose chat is not the one known group. Because the users control who is in that group, this single check authorizes both of them and prevents the bot from acting anywhere else.

A self-message loop is not a concern: Telegram does not deliver a bot's own messages back to it as updates, so the bot never re-processes its own translations.

## Key technical decisions

- **TypeScript on Workers, no web framework.** At two operations (receive an update, send a reply) raw `fetch` is sufficient and keeps the project dependency-free.
- **The LLM provider is encapsulated** behind a single internal boundary, so it can be swapped (Anthropic ↔ OpenAI) without touching the rest of the system.
- **Always respond `200`.** Telegram redelivers updates that do not receive a prompt success response. Returning `200` even on internal failure — and reporting the error into the chat instead — prevents duplicate translations.
- **Secrets vs. configuration.** Credentials are encrypted secrets; the group identifier is plain configuration.

## Out of scope (architectural)

No persistence layer, no background jobs, no CI/CD pipeline, and no multi-environment setup in v1. Each can be added later without disturbing this shape — for example, a Cloudflare key-value store bolts on cleanly if per-person preferences or saved history are wanted.
