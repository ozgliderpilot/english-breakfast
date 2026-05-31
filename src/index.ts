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
