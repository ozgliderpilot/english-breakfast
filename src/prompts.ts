import { detectDirection } from "./language";

// Shared output constraint, referenced by every prompt so the rule stays in
// one place (the bot sends replies as plain text, with no parse_mode).
const PLAIN_OUTPUT_RULE =
  "Reply as plain text (no Markdown), with no preamble, labels, quotes, or extra notes.";

function buildPrompt(source: string, target: string): string {
  return (
    `You translate ${source}→${target} for a user learning English. ` +
    `Match the FIRST input type that applies and reply in only that format. ${PLAIN_OUTPUT_RULE}\n` +
    `- Proverb/idiom: closest ${target} equivalent; if none is close, say so briefly, then a plain translation.\n` +
    `- Slang/very informal: natural ${target} equivalent, then a short register note, e.g. "(slang, casual)".\n` +
    `- Acronym/abbreviation: expansion + ${target} translation + one-line gloss.\n` +
    `- Proper noun/name: transliterate, or use the established ${target} form.\n` +
    `- Full sentence: plain translation preserving register and tone.\n` +
    `- Word or short phrase (incl. phrasal verbs): a learning card —\n` +
    `  - Show the IPA of the English word (source or translation, whichever is English).\n` +
    `  - List the common distinct meanings, most common first; merge near-synonyms.\n` +
    `  - 1 meaning: ${target} translation, a "Collocations:" line (2–4 common English pairings), blank line, then 2 English example sentences.\n` +
    `  - 2 meanings: numbered; each "${target} translation — short English gloss"; 2 examples each; no collocations.\n` +
    `  - 3+ meanings: numbered; each "${target} translation — short English gloss"; 1 example each; no collocations.\n` +
    `  - Examples are English sentences, each prefixed "• ".`
  );
}

export const EN_TO_RU_PROMPT = buildPrompt("English", "Russian");
export const RU_TO_EN_PROMPT = buildPrompt("Russian", "English");

export const REFINE_SYSTEM_PROMPT =
  "You adjust an existing translation. You are given a previous translation and an " +
  "adjustment instruction. Apply the instruction and return the revised text in the " +
  "same language as the previous translation. Output only the revised text. " +
  PLAIN_OUTPUT_RULE;

export function refineUserMessage(previous: string, instruction: string): string {
  return `Previous translation:\n${previous}\n\nAdjustment:\n${instruction}`;
}

export function selectFreshPrompt(text: string): string {
  return detectDirection(text) === "ru2en" ? RU_TO_EN_PROMPT : EN_TO_RU_PROMPT;
}
