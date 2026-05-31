import type { Env, TgUpdate } from "./types";
import { hasValidSecret, isAllowedChat } from "./auth";
import { decide } from "./dispatch";
import { selectFreshPrompt, REFINE_SYSTEM_PROMPT, refineUserMessage } from "./prompts";
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

    const chatId = action.chatId;

    // Translate + reply. Always 200, even on failure.
    try {
      const result =
        action.kind === "fresh"
          ? await translate(selectFreshPrompt(action.text), action.text, env)
          : await translate(
              REFINE_SYSTEM_PROMPT,
              refineUserMessage(action.previous, action.instruction),
              env,
            );

      await sendMessage(chatId, result, action.replyTo, env);
    } catch (err) {
      // Surface the failure in the Cloudflare logs (observability is enabled),
      // then report into the chat. Always return 200 regardless.
      console.error("translate/send failed", err);
      try {
        await sendMessage(chatId, "⚠️ Translation failed — please try again.", action.replyTo, env);
      } catch (reportErr) {
        console.error("failed to report error into chat", reportErr);
      }
    }

    return new Response("ok");
  },
};
