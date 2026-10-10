# Deploy & Bootstrap Runbook

This document covers the complete one-time setup for the English-Russian translation bot, from a fresh repository clone to a live Telegram group.

---

## 1. Prerequisites

- **Node.js 20 or later** — verify with `node --version`
- A **Cloudflare account** (free tier is sufficient) — <https://dash.cloudflare.com/sign-up>
- An **Anthropic API key** — <https://console.anthropic.com/>
- A Telegram account (you will create the bot in step 3)

Install project dependencies once:

```
npm install
```

---

## 2. Authenticate with Cloudflare

Run the following command. It opens a browser window; log in and click **Authorize**.

```
npx wrangler login
```

This stores credentials in your local profile. You only need to do this once per machine.

---

## 3. Create the Telegram Bot

1. Open Telegram and start a chat with **@BotFather**.
2. Send `/newbot` and follow the prompts (name, then username ending in `bot`).
3. BotFather replies with your `BOT_TOKEN`. Copy it — it looks like `7123456789:AAF…`.

---

## 4. Disable Group Privacy Mode

By default, bots only see messages that mention them directly. You must disable this so the bot can read all group messages.

1. In BotFather, send `/mybots`.
2. Select your bot.
3. Choose **Bot Settings** → **Group Privacy** → **Turn off**.

> **Important:** Privacy mode changes only take effect **after you remove the bot from any group and re-add it**. If you add the bot to a group before completing this step (or forget to re-add after changing the setting), it will silently miss all messages.

---

## 5. Create the Telegram Group

Create a Telegram group containing:

- Both people who will use the bot
- The bot itself (add it as a member)

Note: regular group IDs are negative integers (e.g. `-1001234567890`). Supergroup IDs start with `-100`.

---

## 6. Generate a Strong WEBHOOK_SECRET

This secret is sent by Telegram with every update and verified by the Worker. Generate a cryptographically random value:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This works on Windows, macOS, and Linux without additional tools. Save the output — you will use it in steps 7 and 9.

---

## 7. Store the Three Runtime Secrets

Run each command below. Wrangler will prompt you to paste the value (input is hidden).

```
npx wrangler secret put BOT_TOKEN
npx wrangler secret put LLM_API_KEY
npx wrangler secret put WEBHOOK_SECRET
```

These are stored encrypted in Cloudflare and never appear in your source code or `wrangler.jsonc`.

---

## 8. First Deploy

```
npx wrangler deploy
```

On success, Wrangler prints the Worker URL:

```
https://translate-bot.<your-subdomain>.workers.dev
```

Note this URL — you need it in step 9.

---

## 9. Register the Webhook

Bind your Worker URL and the secret token in a single call. Replace the placeholders with real values.

```
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://translate-bot.<subdomain>.workers.dev/webhook&secret_token=<WEBHOOK_SECRET>"
```

Verify the registration succeeded:

```
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

The response should show your Worker URL and `"pending_update_count": 0`.

---

## 10. Discover the Group Chat ID

Telegram does not tell you the group's numeric ID up front; you need to ask it to send one message and observe the incoming update. This step must come after the webhook is registered (step 9) — only then does Telegram deliver group messages to the Worker.

No code edit is required: until `ALLOWED_CHAT_ID` matches your group, the Worker rejects every message but logs the rejected chat's ID (see the "Perimeter 2" check in `src/index.ts`). You read that ID from the logs, set it, and redeploy.

1. Tail the Worker logs in a separate terminal:

   ```
   npx wrangler tail
   ```

2. Send any message in your Telegram group.

3. In the tail output you will see a log line like:

   ```
   rejected message from non-allowed chat: -1001234567890
   ```

4. Copy that number. Open `wrangler.jsonc` and set `ALLOWED_CHAT_ID`:

   ```jsonc
   "vars": {
     "ALLOWED_CHAT_ID": "-1001234567890"
   }
   ```

5. Redeploy so the new value takes effect. After the GitHub Action in [Later deploys](#12-later-deploys) is in place, commit `wrangler.jsonc` and push to `main`. Until then, or if you need to ship from this machine, use the manual fallback:

   ```
   npx wrangler deploy
   ```

> Group IDs are negative. If your value is positive, the group has not been upgraded to a supergroup yet, which is fine — just use the value you see.

---

## 11. Smoke Test

In your Telegram group, try the following scenarios:

| Action | Expected result |
|---|---|
| Send an English phrase, e.g. `Good morning!` | Bot replies with a Russian learning card, threaded to your message |
| Send a Russian phrase, e.g. `Как дела?` | Bot replies with an English learning card, threaded to your message |
| Send a multi-meaning English word, e.g. `spring` | Bot replies with a numbered list of senses (e.g. the season, a coiled spring, to jump), each with English example sentences prefixed by `• ` |
| Reply to a bot reply with `more formal` | Bot replies with an adjusted version in the same language |
| Send a message starting with `.`, e.g. `.ignore this` | Bot does nothing |
| Send a message starting with `,`, e.g. `,aside` | Bot does nothing |

If a translation fails, the bot sends `⚠️ Translation failed — please try again.` and the Worker still returns HTTP 200 (so Telegram does not retry).

---

## 12. Later deploys

Push to `main`, including a merge, deploys production. The workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) checks out the repo, installs dependencies with `npm ci`, runs `npm test` and `npm run typecheck`, and deploys only if those pass. Deploy uses `cloudflare/wrangler-action` (`command: deploy`), which runs the same Wrangler deploy as `npm run deploy`.

The workflow reads two GitHub Actions secrets, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. It does not contain `BOT_TOKEN`, `LLM_API_KEY`, or `WEBHOOK_SECRET` — those stay on the Worker — and it does not call Telegram `setWebhook`. `ALLOWED_CHAT_ID` ships in `wrangler.jsonc`.

**Manual fallback.** From a machine that has already run `npx wrangler login` (section 2):

```
npx wrangler deploy
```

The first deploy from GitHub happens on the merge to `main` after those two secrets exist. A push before that fails authentication and does not publish a new Worker version.

---

## 13. Rollback and updating secrets

**Rollback:** Cloudflare keeps previous Worker versions. In the [Cloudflare dashboard](https://dash.cloudflare.com), open Workers & Pages → translate-bot → Deployments → Rollback.

**Updating secrets:** Re-run `wrangler secret put <NAME>` at any time. The new value is picked up immediately on the next request — no redeploy needed.

---

## 14. Local Development

Local dev runs the actual Worker with real LLM and Telegram calls, so use a real Anthropic key and a real `BOT_TOKEN`.

### Setup

1. Copy the example vars file:

   ```
   # Windows (cmd)
   copy .dev.vars.example .dev.vars

   # bash / macOS / Linux
   cp .dev.vars.example .dev.vars
   ```

2. Open `.dev.vars` and fill in all three secrets plus the chat ID:

   ```
   BOT_TOKEN=<your real token>
   LLM_API_KEY=<your Anthropic key>
   WEBHOOK_SECRET=<same value you registered with Telegram>
   ALLOWED_CHAT_ID=-100123
   ```

   > `ALLOWED_CHAT_ID` must match the `chat.id` in your test payloads. The example payloads below use `-100123`.

3. Start the dev server:

   ```
   npx wrangler dev
   ```

### Sending Test Requests

The dev server listens on `http://localhost:8787`.

**Fresh translation (Windows cmd / PowerShell — use `^` for line continuation):**

```
curl -X POST http://localhost:8787/webhook ^
  -H "content-type: application/json" ^
  -H "X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>" ^
  -d "{\"message\":{\"message_id\":10,\"text\":\"How are you?\",\"chat\":{\"id\":-100123,\"type\":\"supergroup\"},\"from\":{\"id\":111,\"is_bot\":false}}}"
```

**Refine (reply to a bot message — `from.id` in `reply_to_message` must equal the bot's numeric ID, i.e. the prefix before `:` in `BOT_TOKEN`):**

```
curl -X POST http://localhost:8787/webhook ^
  -H "content-type: application/json" ^
  -H "X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>" ^
  -d "{\"message\":{\"message_id\":11,\"text\":\"more formal\",\"chat\":{\"id\":-100123,\"type\":\"supergroup\"},\"from\":{\"id\":111,\"is_bot\":false},\"reply_to_message\":{\"message_id\":10,\"text\":\"Как дела?\",\"from\":{\"id\":123456,\"is_bot\":true}}}}"
```

> Replace `123456` in `reply_to_message.from.id` with the actual numeric prefix of your `BOT_TOKEN`. For example, if your token starts with `7123456789:`, use `7123456789`.

**On bash (macOS / Linux / Git Bash) — use `\` for line continuation:**

```bash
curl -X POST http://localhost:8787/webhook \
  -H "content-type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>" \
  -d '{"message":{"message_id":10,"text":"How are you?","chat":{"id":-100123,"type":"supergroup"},"from":{"id":111,"is_bot":false}}}'
```

`.dev.vars` is listed in `.gitignore` and will never be committed.
