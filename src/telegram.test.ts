import { describe, it, expect } from "vitest";
import { splitForTelegram } from "./telegram";

const MAX = 4096;

describe("splitForTelegram", () => {
  it("returns the text unchanged when it is within the limit", () => {
    expect(splitForTelegram("hello")).toEqual(["hello"]);
  });

  it("keeps a message of exactly 4096 chars as one chunk", () => {
    const text = "a".repeat(MAX);
    expect(splitForTelegram(text)).toEqual([text]);
  });

  it("splits a 4097-char single line (no newline) into 4096 + 1", () => {
    const text = "a".repeat(MAX + 1);
    const chunks = splitForTelegram(text);
    expect(chunks).toEqual(["a".repeat(MAX), "a"]);
  });

  it("never produces a chunk longer than the limit", () => {
    const text = "x".repeat(MAX * 3 + 17);
    for (const chunk of splitForTelegram(text)) {
      expect(chunk.length).toBeLessThanOrEqual(MAX);
    }
  });

  it("prefers to break at a newline and drops the boundary newline", () => {
    const head = "a".repeat(MAX - 5);
    const tail = "b".repeat(100);
    const chunks = splitForTelegram(`${head}\n${tail}`);
    expect(chunks).toEqual([head, tail]);
  });
});
