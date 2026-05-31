import { describe, it, expect } from "vitest";
import { selectFreshPrompt, EN_TO_RU_PROMPT, RU_TO_EN_PROMPT } from "./prompts";

describe("selectFreshPrompt", () => {
  it("English text → returns EN_TO_RU_PROMPT (identity)", () => {
    expect(selectFreshPrompt("hello there")).toBe(EN_TO_RU_PROMPT);
  });

  it("Russian text → returns RU_TO_EN_PROMPT (identity)", () => {
    expect(selectFreshPrompt("привет, как дела")).toBe(RU_TO_EN_PROMPT);
  });
});
