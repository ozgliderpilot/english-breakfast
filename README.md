# English Breakfast — Telegram Translation Bot

A stateless Cloudflare Worker that acts as an English-learning aid for a couple studying English. Send any word or phrase and the bot detects the language direction deterministically (by counting Cyrillic vs Latin characters), then replies with a compact learning card — a translation plus English usage examples, with numbered senses for multi-meaning words. Direction detection is unit-tested; card formatting is produced by the LLM. Reply to a bot reply with an instruction (e.g. "more formal") to refine the translation in place. Messages that begin with `.` or `,` are treated as human asides and ignored. Full design rationale and acceptance criteria are in [specs/](specs/).

## Module Map

| File | Responsibility |
|---|---|
| `src/index.ts` | Fetch handler: routing, auth checks, orchestration, always-200 error catch |
| `src/auth.ts` | `hasValidSecret` (WEBHOOK_SECRET header) + `isAllowedChat` (chat allowlist) |
| `src/dispatch.ts` | `decide()` — classifies an update as `ignore`, `fresh`, or `refine` |
| `src/language.ts` | `detectDirection` — counts Cyrillic vs Latin letters to determine translation direction |
| `src/prompts.ts` | Directional learning-card prompts (`EN_TO_RU_PROMPT`, `RU_TO_EN_PROMPT`), `selectFreshPrompt`, and `refineUserMessage` |
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
