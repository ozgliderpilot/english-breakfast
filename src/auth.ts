import type { Env, TgUpdate } from "./types";

export function hasValidSecret(request: Request, env: Env): boolean {
  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === env.WEBHOOK_SECRET;
}

export function isAllowedChat(update: TgUpdate, env: Env): boolean {
  return update.message?.chat.id === Number(env.ALLOWED_CHAT_ID);
}
