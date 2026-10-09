import type { Env } from "./types";

const MODEL = "claude-haiku-5-5";
const ANSWER_TOKENS = 2663;
const THINKING_TOKENS = 2048;
const MAX_TOKENS = ANSWER_TOKENS + THINKING_TOKENS;

export async function translate(
  systemPrompt: string,
  userText: string,
  env: Env,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.LLM_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!res.ok) throw new Error(`LLM error ${res.status}`);

  const data: any = await res.json();
  const out = (data.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();

  if (!out) throw new Error("LLM returned empty text");

  // If the model hit the token cap the text is cut off mid-thought; flag it
  // rather than presenting a truncated card as a complete answer.
  return data.stop_reason === "max_tokens" ? `${out}\n\n…(truncated)` : out;
}
