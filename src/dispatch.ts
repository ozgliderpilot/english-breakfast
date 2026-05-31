import type { Action, TgUpdate } from "./types";

export function decide(update: TgUpdate, botId: number): Action {
  const msg = update.message;
  if (!msg || !msg.text) return { kind: "ignore" };

  const text = msg.text;
  const head = text.trimStart();
  if (head.startsWith(",") || head.startsWith(".")) return { kind: "ignore" };

  const reply = msg.reply_to_message;
  if (reply && reply.from?.id === botId && reply.text) {
    return {
      kind: "refine",
      previous: reply.text,
      instruction: text,
      replyTo: msg.message_id,
    };
  }

  return { kind: "fresh", text, replyTo: msg.message_id };
}
