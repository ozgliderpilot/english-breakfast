import { detectDirection } from "./language";

// Shared output constraint, referenced by every prompt so the rule stays in
// one place (the bot sends replies as plain text, with no parse_mode).
const PLAIN_OUTPUT_RULE =
  "Reply as plain text (no Markdown), with no preamble, labels, quotes, or extra notes.";

// The two directions are deliberately separate strings rather than one
// parameterized template: EN→RU shows the IPA of the English input word,
// RU→EN does not, and they are free to diverge further from here.

export const EN_TO_RU_PROMPT =
  `You translate English→Russian for a user learning English. ` +
  `Match the FIRST input type that applies and reply in only that format. ${PLAIN_OUTPUT_RULE}\n` +
  `- Proverb/idiom: closest Russian equivalent; if none is close, say so briefly, then a plain translation.\n` +
  `- Slang/very informal: natural Russian equivalent, then a short register note, e.g. "(slang, casual)".\n` +
  `- Acronym/abbreviation: expansion + Russian translation + one-line gloss.\n` +
  `- Proper noun/name: transliterate, or use the established Russian form.\n` +
  `- Full sentence: plain translation preserving register and tone.\n` +
  `- Word or short phrase (incl. phrasal verbs): a learning card —\n` +
  `  - Show the IPA of the English input word.\n` +
  `  - List the common distinct meanings, most common first; merge near-synonyms.\n` +
  `  - 1 meaning: Russian translation, a "Collocations:" line (2–4 common English pairings), blank line, then 2 English example sentences.\n` +
  `  - 2 meanings: numbered; each "Russian translation — short English gloss"; 2 examples each; no collocations.\n` +
  `  - 3+ meanings: numbered; each "Russian translation — short English gloss"; 1 example each; no collocations.\n` +
  `  - Examples are English sentences, each prefixed "• ".`;

export const RU_TO_EN_PROMPT =
  `You translate Russian→English for a user learning English. ` +
  `Match the FIRST input type that applies and reply in only that format. ${PLAIN_OUTPUT_RULE}\n` +
  `- Proverb/idiom: closest English equivalent; if none is close, say so briefly, then a plain translation.\n` +
  `- Slang/very informal: natural English equivalent, then a short register note, e.g. "(slang, casual)".\n` +
  `- Acronym/abbreviation: expansion + English translation + one-line gloss.\n` +
  `- Proper noun/name: transliterate, or use the established English form.\n` +
  `- Full sentence: plain translation preserving register and tone.\n` +
  `- Word or short phrase (incl. phrasal verbs): a learning card —\n` +
  `  - List the common distinct meanings, most common first; merge near-synonyms.\n` +
  `  - 1 meaning: English translation, a "Collocations:" line (2–4 common English pairings), blank line, then 2 English example sentences.\n` +
  `  - 2 meanings: numbered; each "English translation — short English gloss"; 2 examples each; no collocations.\n` +
  `  - 3+ meanings: numbered; each "English translation — short English gloss"; 1 example each; no collocations.\n` +
  `  - Examples are English sentences, each prefixed "• ".`;

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
