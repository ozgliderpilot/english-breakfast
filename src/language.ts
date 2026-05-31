export type Direction = "en2ru" | "ru2en";

/**
 * Detect translation direction by counting Cyrillic (U+0400–U+04FF) vs basic-Latin (A–Z, a–z) letters.
 * Returns "ru2en" only when Cyrillic strictly outnumbers Latin; otherwise "en2ru".
 * Ties, letterless input, and empty strings all default to "en2ru".
 */
export function detectDirection(text: string): Direction {
  let cyrillic = 0;
  let latin = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0400 && cp <= 0x04ff) {
      cyrillic++;
    } else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) {
      latin++;
    }
  }
  return cyrillic > latin ? "ru2en" : "en2ru";
}
