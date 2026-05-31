# Design

> Builds on `architecture.md`. Focuses on behaviour, data, and the responsibilities of each part of the Worker.

## Module responsibilities

The Worker is small enough to be one file, but the responsibilities are kept distinct:

- **Entry / router** — the `fetch` handler and the only entry point. Owns request routing and the always-`200` contract.
- **Auth** — the perimeter check (secret-token header and group allowlist). Pure predicates, no side effects.
- **Dispatch** — the decision tree that turns an authenticated update into an action: ignore, fresh translation, or refine.
- **Prompts** — builds the system prompts for the two modes.
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

**Fresh translation.** Detect whether the phrase is English or Russian and translate it into the other language. Output only the translation — no preamble, no quotation marks, no explanation. Direction detection lives entirely in the prompt; nothing is stored.

**Refine.** Take a previous translation plus an adjustment instruction and return the adjusted text, in the same language as the previous result. Output only the result.

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
