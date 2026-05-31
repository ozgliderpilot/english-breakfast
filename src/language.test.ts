import { describe, it, expect } from "vitest";
import { detectDirection } from "./language";

describe("detectDirection", () => {
  it("pure English → en2ru", () => {
    expect(detectDirection("Hello there")).toBe("en2ru");
  });

  it("pure Russian including Ёё → ru2en", () => {
    expect(detectDirection("Привет, Ёжик!")).toBe("ru2en");
  });

  it("majority-Cyrillic mixed → ru2en", () => {
    // "Привет, ok" → Cyrillic: П,р,и,в,е,т = 6; Latin: o,k = 2 → ru2en
    expect(detectDirection("Привет, ok")).toBe("ru2en");
  });

  it("majority-Latin mixed → en2ru", () => {
    // "hello мир" → Latin: h,e,l,l,o = 5; Cyrillic: м,и,р = 3 → en2ru
    expect(detectDirection("hello мир")).toBe("en2ru");
  });

  it("exact tie → en2ru", () => {
    // "abc абв" → Latin: a,b,c = 3; Cyrillic: а,б,в = 3 → tie → en2ru
    expect(detectDirection("abc абв")).toBe("en2ru");
  });

  it("digits/punctuation only (no letters) → en2ru", () => {
    expect(detectDirection("123! 🙂")).toBe("en2ru");
  });

  it("digits with Latin letters → en2ru", () => {
    // "100% OK!" → Latin: O,K = 2; Cyrillic: 0 → en2ru
    expect(detectDirection("100% OK!")).toBe("en2ru");
  });

  it("emoji only → en2ru", () => {
    expect(detectDirection("🙂")).toBe("en2ru");
  });

  it("empty string → en2ru", () => {
    expect(detectDirection("")).toBe("en2ru");
  });
});
