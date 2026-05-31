# Acceptance-Criteria Verification Matrix

## Test & Typecheck Baseline

All checks confirmed green immediately before this document was written:

```
npm test
  Test Files  2 passed (2)
       Tests  26 passed (26)

npm run typecheck
  (exit 0, no errors)
```

---

## Secret Hygiene Audit

`git ls-files` output (full listing):

```
.dev.vars.example
.gitignore
.idea/.gitignore
.idea/english-breakfast.iml
.idea/misc.xml
.idea/modules.xml
package-lock.json
package.json
specs/architecture.md
specs/design.md
specs/goals.md
specs/implementation-plan.md
src/auth.test.ts
src/auth.ts
src/dispatch.test.ts
src/dispatch.ts
src/index.ts
src/llm.ts
src/prompts.ts
src/telegram.ts
src/types.ts
tsconfig.json
wrangler.jsonc
```

No `.dev.vars` (real secrets), no `.env`, no `secrets.*` file appears in the listing. `.gitignore` line 4 explicitly excludes `.dev.vars`. `.dev.vars.example` contains only placeholder values (`123456:your-token`, `sk-ant-...`, `some-long-random-string`).

---

## Acceptance-Criteria Matrix

### AC-1 — English↔Russian translation; reply threaded to source message

| Item | Detail |
|---|---|
| **Status** | VERIFIED (inspection) + REQUIRES LIVE DEPLOY (translation quality) |
| **Threading — inspected** | `src/telegram.ts` line 17: the `sendMessage` call always passes `reply_to_message_id: replyToMessageId`. The value supplied is `action.replyTo`, which `decide()` sets to `msg.message_id` of the triggering message (`src/dispatch.ts` lines 19 and 21). Wiring verified in `src/index.ts` line 51: `await sendMessage(chatId, result, action.replyTo, env)`. |
| **Translation direction** | `src/prompts.ts` contains `FRESH_SYSTEM_PROMPT` which instructs the LLM to detect language and produce the opposite (English↔Russian). Verified by inspection; actual output quality requires a live run against the Anthropic API. |
| **Live deploy action** | Send an English and a Russian message in the group; confirm threaded replies in the opposite language. |

---

### AC-2 — Replying to a bot message with an instruction returns adjusted text in the same language

| Item | Detail |
|---|---|
| **Status** | VERIFIED (test) for dispatch logic + REQUIRES LIVE DEPLOY (LLM behaviour) |
| **Dispatch — unit tests** | `src/dispatch.test.ts`, `describe("decide — step 3: reply to bot → refine")`: |
| | • `"reply to bot with text → refine with correct fields"` — asserts `kind: "refine"`, correct `previous`, `instruction`, `replyTo`. |
| | • `"replyTo uses the new message's message_id, not the replied-to id"` — confirms `replyTo` is the instruction message ID. |
| **Not-refine edges — unit tests** | `describe("decide — step 3 edges: NOT refine when reply is not to bot")`: |
| | • `"reply to another human (reply.from.id !== botId) → fresh, not refine"` |
| | • `"reply to bot message with NO text (undefined) → fresh (falls through to step 4)"` |
| **Aside-wins-over-refine — unit tests** | `describe("decide — step 2: human aside prefix → ignore")`: |
| | • `"'.' aside that is ALSO a reply to the bot → ignore (step 2 wins over step 3)"` |
| | • `"',' aside that is ALSO a reply to the bot → ignore (step 2 wins over step 3)"` |
| **Wiring in index.ts** | `src/index.ts` lines 45-48: when `action.kind === "refine"`, `translate()` is called with `REFINE_SYSTEM_PROMPT` and `refineUserMessage(action.previous, action.instruction)`. |
| **Live deploy action** | Reply to a bot translation with "more formal"; confirm adjusted output in the same language. |

---

### AC-3 — Messages beginning with "," or "." are ignored

| Item | Detail |
|---|---|
| **Status** | VERIFIED (test) |
| **Unit tests** | `src/dispatch.test.ts`, `describe("decide — step 2: human aside prefix → ignore")` — 6 tests: |
| | • `"text starting with ',' → ignore"` |
| | • `"text starting with '.' → ignore"` |
| | • `"text with leading spaces then '.' → ignore (trimStart)"` |
| | • `"text with leading spaces then ',' → ignore (trimStart)"` |
| | • `"'.' aside that is ALSO a reply to the bot → ignore (step 2 wins over step 3)"` |
| | • `"',' aside that is ALSO a reply to the bot → ignore (step 2 wins over step 3)"` |
| **Code** | `src/dispatch.ts` lines 8-9: `const head = text.trimStart(); if (head.startsWith(",") \|\| head.startsWith(".")) return { kind: "ignore" };` |

---

### AC-4 — Non-text and service messages are ignored without triggering an LLM call

| Item | Detail |
|---|---|
| **Status** | VERIFIED (test) + VERIFIED (inspection) |
| **Unit tests** | `src/dispatch.test.ts`, `describe("decide — step 1: no message or no text → ignore")`: |
| | • `"update with no message field → ignore"` |
| | • `"message with no text (e.g. sticker/photo) → ignore"` |
| | Also: `"empty string is falsy → caught at step 1 → ignore"` (in step-4 describe block). |
| **Guard in dispatch.ts** | `src/dispatch.ts` line 5: `if (!msg \|\| !msg.text) return { kind: "ignore" };` — an empty string, `undefined`, sticker updates, and service messages all hit this guard. |
| **Guard in index.ts** | `src/index.ts` line 36: `if (action.kind === "ignore") return new Response("ok");` — the LLM call on line 43 is never reached. |

---

### AC-5 — Updates from other chats are silently ignored; missing or wrong secret returns 401

| Item | Detail |
|---|---|
| **Status** | VERIFIED (test) + VERIFIED (inspection) |
| **Chat allowlist — unit tests** | `src/auth.test.ts`, `describe("isAllowedChat")` — 4 tests: |
| | • `"returns true when chat.id matches Number(ALLOWED_CHAT_ID)"` |
| | • `"returns false when chat.id does not match"` |
| | • `"handles string env value matching a positive numeric chat id"` |
| | • `"returns false when update has no message (message is absent)"` |
| **Secret validation — unit tests** | `src/auth.test.ts`, `describe("hasValidSecret")` — 6 tests: |
| | • `"returns true when header exactly matches env.WEBHOOK_SECRET"` |
| | • `"returns false when header is missing"` |
| | • `"returns false when header value is wrong"` |
| | • `"returns false when header is empty string and secret is non-empty"` |
| | • `"returns true when both header and secret are the same empty string"` *(documents degenerate config)* |
| | • `"is case-sensitive (wrong case → false)"` |
| **401 path — inspection** | `src/index.ts` lines 18-20: `if (!hasValidSecret(request, env)) { return new Response("unauthorized", { status: 401 }); }` — this is the only non-200 path in the handler. |
| **Silent-ignore path — inspection** | `src/index.ts` line 31: `if (!isAllowedChat(update, env)) return new Response("ok");` — wrong-chat updates return 200 with no side effects. |

---

### AC-6 — LLM or Telegram failure results in an in-chat error message; Worker still returns 200

| Item | Detail |
|---|---|
| **Status** | VERIFIED (inspection) |
| **Error handling — inspection** | `src/index.ts` lines 41-58: the entire translate + sendMessage block is wrapped in `try/catch`. On failure the inner catch calls `sendMessage(..., "⚠️ Translation failed — please try again.", ...)`. An outer `catch {}` swallows any failure in that fallback send. The function then falls through to `return new Response("ok")` on line 60 unconditionally. |
| **Always-200 contract** | The only non-200 response in the file is the 401 on line 19 (bad secret). Every other code path — including exceptions — returns `new Response("ok")`. Telegram will therefore not retry the update. |
| **Live deploy action** | Temporarily set an invalid `LLM_API_KEY` or `BOT_TOKEN` in local `.dev.vars`, send a message, and confirm the bot posts the error message and the Worker logs show no retries. |

---

### AC-7 — No secrets committed; three secrets managed via `wrangler secret put`

| Item | Detail |
|---|---|
| **Status** | VERIFIED (inspection + git ls-files) |
| **git ls-files audit** | See the **Secret Hygiene Audit** section above. `.dev.vars` is absent from tracking. No `.env`, `secrets.*`, or credential files appear. |
| **.gitignore** | `src/.gitignore` line 4: `.dev.vars` is explicitly excluded. |
| **.dev.vars.example** | Tracked file contains only placeholder values; serves as a template for local dev without exposing real credentials. |
| **wrangler.jsonc** | Only non-secret configuration (`ALLOWED_CHAT_ID`, which is a group ID — not a credential) lives in `vars`. All three runtime secrets (`BOT_TOKEN`, `LLM_API_KEY`, `WEBHOOK_SECRET`) are absent from this file. |
| **Runbook** | `DEPLOY.md` step 7 instructs the operator to provision all three secrets via `npx wrangler secret put`. |
