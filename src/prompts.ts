import { detectDirection } from "./language";

function buildPrompt(source: string, target: string): string {
  return (
    `You are a translation and English-learning assistant for a user who is learning English. ` +
    `The user sends a word or short phrase in ${source}. ` +
    `Translate it into ${target} and present it as a compact learning card.\n\n` +
    `Rules:\n` +
    `- Identify the common, genuinely distinct meanings of the input. Keep near-synonyms together as one meaning; only separate clearly different meanings. Order meanings from most to least common.\n` +
    `- If there is ONE meaning: output the ${target} translation on the first line, then a blank line, then exactly 2 example sentences.\n` +
    `- If there are TWO meanings: output a numbered list (1., 2.). For each meaning write the ${target} translation, then ' — ', then a short English description of that sense; on the following lines give 2 example sentences.\n` +
    `- If there are THREE OR MORE meanings: output a numbered list of ALL common meanings, each with the ${target} translation, ' — ', a short English description, followed by 1 example sentence.\n` +
    `- Every example sentence must be in English and must use the English term naturally in context. (For English-to-Russian, the English term is the original input; for Russian-to-English, it is your English translation.) Prefix each example with '• ' and indent examples that sit under a numbered meaning.\n` +
    `- Output ONLY the card — no preamble, no surrounding quotation marks, no closing notes.`
  );
}

export const EN_TO_RU_PROMPT = buildPrompt("English", "Russian");
export const RU_TO_EN_PROMPT = buildPrompt("Russian", "English");

export const REFINE_SYSTEM_PROMPT =
  "You adjust an existing translation. You are given a previous translation and an " +
  "adjustment instruction. Apply the instruction and return the revised text in the " +
  "same language as the previous translation. " +
  "Output only the revised text — no preamble, no quotation marks, no notes.";

export function refineUserMessage(previous: string, instruction: string): string {
  return `Previous translation:\n${previous}\n\nAdjustment:\n${instruction}`;
}

export function selectFreshPrompt(text: string): string {
  return detectDirection(text) === "ru2en" ? RU_TO_EN_PROMPT : EN_TO_RU_PROMPT;
}
