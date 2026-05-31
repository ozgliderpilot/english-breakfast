import type { Env } from "./types";

// Telegram rejects a sendMessage whose text exceeds 4096 characters.
const TELEGRAM_MAX_CHARS = 4096;

export async function sendMessage(
  chatId: number,
  text: string,
  replyToMessageId: number,
  env: Env,
): Promise<void> {
  for (const chunk of splitForTelegram(text)) {
    const res = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          reply_to_message_id: replyToMessageId,
          // If the message being replied to is gone, still send (unthreaded)
          // rather than failing the whole reply with a 400.
          allow_sending_without_reply: true,
        }),
      },
    );

    if (!res.ok) throw new Error(`Telegram error ${res.status}`);
  }
}

/** Split text into <=4096-char chunks, preferring to break at a newline. */
export function splitForTelegram(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_CHARS) return [text];

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > TELEGRAM_MAX_CHARS) {
    const nl = rest.lastIndexOf("\n", TELEGRAM_MAX_CHARS);
    const cut = nl > 0 ? nl : TELEGRAM_MAX_CHARS; // no usable newline → hard cut
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}
