# Design

> Builds on `architecture.md`. Focuses on behaviour, data, and the responsibilities of each part of the Worker.

## Module responsibilities

The Worker is small enough to be one file, but the responsibilities are kept distinct:

- **Entry / router** — the `fetch` handler and the only entry point. Owns request routing and the always-`200` contract.
- **Auth** — the perimeter check (secret-token header and group allowlist). Pure predicates, no side effects.
- **Dispatch** — the decision tree that turns an authenticated update into an action: ignore, fresh translation, or refine.
- **Language detection** — `detectDirection(text)` counts Cyrillic vs. basic-Latin letters and returns `"ru2en"` or `"en2ru"`. Deterministic; no LLM involved.
- **Prompts** — two separate directional system prompts (`EN_TO_RU_PROMPT`, `RU_TO_EN_PROMPT`) — kept distinct because they diverge (EN→RU shows IPA, RU→EN does not) — plus the refine prompt. `selectFreshPrompt(text)` calls `detectDirection` to choose the right one.
- **LLM** — one function: text plus a system prompt in, translated text out. The only place that knows which provider is used.
- **Telegram** — wraps the `sendMessage` reply call.

## Trigger behaviour

The group is dedicated to translation, so the common case costs nothing and only the exception is marked.

- **Translate by default.** Any text message is translated.
- **Opt-out sentinel.** A message whose text begins with a comma (`,`) or a full stop (`.`) is ignored and treated as a human aside between the two users. These leading characters never begin a phrase someone would genuinely want translated, so false positives are effectively impossible. The check runs first and unconditionally, so it also reliably cancels a refine (for example, replying `.never mind`).
- **Refine by reply.** Replying to one of the bot's own messages with an instruction ("more formal", "shorter") re-runs it in refine mode. Replies to the bot are delivered even when privacy mode is on, so this works regardless of the privacy setting.

## Dispatch decision tree

Applied to every authenticated update, in this order; each branch is terminal:

1. **No text** (sticker, photo, or a service message such as "X joined") → ignore.
2. **Text starts with `,` or `.`** → ignore (human aside).
3. **Reply to one of the bot's own messages** → **refine**.
4. **Otherwise** → **fresh translation**.

Step 3 must confirm the replied-to message was sent *by the bot* (not by the other person), so a reply between the two humans is never mistaken for a refine.

## The two modes

**Fresh translation.** Direction is detected deterministically in code (see Language detection above): `detectDirection` counts Cyrillic vs. basic-Latin letters in the message text and selects the appropriate directional prompt before any LLM call. Nothing is stored. The model then classifies the input as exactly one of six types (checked in this order) and replies in the matching format — only the word/phrase case uses the full learning card:

1. **Proverb / idiom** → the closest equivalent proverb or idiom in the target language; if none is close, a one-line note saying so plus a best plain translation. No card.
2. **Slang / very informal** → a natural target-language equivalent, with a brief register note (e.g. "(slang, casual)"). No card.
3. **Acronym / abbreviation** → the full expansion, its translation, and a one-line gloss.
4. **Proper noun / name** → transliterated (or the established target-language form), not translated by meaning.
5. **Full sentence** → a plain translation that preserves the original register and tone. No examples, no card.
6. **Word / short lexical phrase** (incl. phrasal verbs, collocations) → the **learning card**, because the user is learning English:
   - **EN→RU only:** the English input word carries its **IPA** pronunciation. RU→EN cards omit IPA — the English output is what the learner is producing, so per-word IPA is noise.
   - **Sense handling** (ordered most-common first): 1 meaning → translation line (with IPA for EN→RU), a short `Collocations:` line of common English pairings, blank line, then 2 English example sentences; 2 meanings → numbered list, each `<translation> — <short English sense tag>` (IPA on the English word for EN→RU) with 2 examples, collocations omitted; 3+ meanings → numbered list of all common meanings, each with 1 example, collocations omitted.
   - Every example sentence is in English, prefixed with `• `; examples under a numbered meaning are indented.

Output is the reply only — no preamble, no category label, no surrounding quotation marks, no closing notes.

**Refine.** Take a previous translation plus an adjustment instruction and return the adjusted text, in the same language as the previous result. Output only the result. Note: when refining a multi-line learning card, the instruction (e.g. "more formal") is inherently ambiguous about which part of the card to adjust; refine operates on the whole previous output as-is.

### The refine constraint (important)

When a user replies to the bot, Telegram includes the **bot's previous message** (its last translation) in the update, but **not** the user's original phrase — Telegram does not nest two reply levels deep. Refine therefore operates on the produced translation *in place*: it transforms the previous output and does not re-translate from a source it cannot see.

This is why refine is well-defined for instructions like "more formal", "more casual", or "shorter", but does **not** cover "you mistranslated word X" measured against the original — correcting against the source would require stored state and is deferred. As a result, refine is stateless, exactly like fresh translation.

## Data contracts

**Inbound** — only a thin slice of Telegram's `Update` is used:

```
message {
  message_id
  text
  chat { id, type }
  from { id, is_bot }
  reply_to_message? { message_id, text, from { id } }
}
```

**Outbound** — the reply:

```
sendMessage { chat_id, text, reply_to_message_id }
```

Every reply sets `reply_to_message_id` to the triggering message so that, with two people pasting into one chat, each result is visibly attached to the phrase that produced it.

**LLM** — a standard messages request (system prompt plus the user text); the translated text is read back from the response.

These three small shapes are the entire data surface and are worth expressing as types so the dispatch logic is type-checked.

## Identity without storage

The bot's own user ID — needed in step 3 to recognize replies to itself — is the numeric prefix of the bot token, so it is derived at runtime rather than configured or stored.

## Error handling

- **Guard early.** Anything without `message.text` returns before any LLM call, so stickers and service messages never cost a request.
- **Fail into the chat, not the protocol.** If the LLM call or the Telegram reply fails, the Worker sends a short error message into the group and still returns `200`. A non-`200` would cause Telegram to redeliver the update and produce duplicate work; reporting the error in-band avoids that while keeping the user informed.

## Configuration surface

- **Secrets (encrypted):** bot token, LLM API key, webhook secret.
- **Configuration (plain):** the allowed group's chat id.
