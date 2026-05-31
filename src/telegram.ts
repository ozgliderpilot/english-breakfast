import type { Env } from "./types";

export async function sendMessage(
  chatId: number,
  text: string,
  replyToMessageId: number,
  env: Env,
): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
      }),
    },
  );

  if (!res.ok) throw new Error(`Telegram error ${res.status}`);
}
