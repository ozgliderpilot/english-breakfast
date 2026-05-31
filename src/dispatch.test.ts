import { describe, it, expect } from "vitest";
import { decide } from "./dispatch";
import type { TgUpdate } from "./types";

const BOT_ID = 42;
const HUMAN_ID = 99;
const CHAT_ID = -1001234567890;

/** Helper: build a minimal update with just a message text */
function textUpdate(text: string, messageId = 1): TgUpdate {
  return {
    message: {
      message_id: messageId,
      text,
      chat: { id: CHAT_ID, type: "group" },
      from: { id: HUMAN_ID, is_bot: false },
    },
  };
}

/** Helper: build an update that is a reply to a given sender */
function replyUpdate(
  text: string,
  replyFromId: number,
  replyText: string | undefined,
  messageId = 10,
  replyMessageId = 5,
): TgUpdate {
  return {
    message: {
      message_id: messageId,
      text,
      chat: { id: CHAT_ID, type: "group" },
      from: { id: HUMAN_ID, is_bot: false },
      reply_to_message: {
        message_id: replyMessageId,
        text: replyText,
        from: { id: replyFromId, is_bot: replyFromId === BOT_ID },
      },
    },
  };
}

describe("decide — step 1: no message or no text → ignore", () => {
  it("update with no message field → ignore", () => {
    const update: TgUpdate = {};
    expect(decide(update, BOT_ID)).toEqual({ kind: "ignore" });
  });

  it("message with no text (e.g. sticker/photo) → ignore", () => {
    const update: TgUpdate = {
      message: {
        message_id: 1,
        chat: { id: CHAT_ID, type: "group" },
      },
    };
    expect(decide(update, BOT_ID)).toEqual({ kind: "ignore" });
  });
});

describe("decide — step 2: human aside prefix → ignore", () => {
  it("text starting with ',' → ignore", () => {
    expect(decide(textUpdate(",nah skip this"), BOT_ID)).toEqual({ kind: "ignore" });
  });

  it("text starting with '.' → ignore", () => {
    expect(decide(textUpdate(".never mind"), BOT_ID)).toEqual({ kind: "ignore" });
  });

  it("text with leading spaces then '.' → ignore (trimStart)", () => {
    expect(decide(textUpdate("   .aside"), BOT_ID)).toEqual({ kind: "ignore" });
  });

  it("text with leading spaces then ',' → ignore (trimStart)", () => {
    expect(decide(textUpdate("   ,skip"), BOT_ID)).toEqual({ kind: "ignore" });
  });

  it("'.' aside that is ALSO a reply to the bot → ignore (step 2 wins over step 3)", () => {
    const update = replyUpdate(".never mind", BOT_ID, "previous bot text");
    expect(decide(update, BOT_ID)).toEqual({ kind: "ignore" });
  });

  it("',' aside that is ALSO a reply to the bot → ignore (step 2 wins over step 3)", () => {
    const update = replyUpdate(",cancel", BOT_ID, "previous bot text");
    expect(decide(update, BOT_ID)).toEqual({ kind: "ignore" });
  });
});

describe("decide — step 3: reply to bot → refine", () => {
  it("reply to bot with text → refine with correct fields", () => {
    const update = replyUpdate(
      "make it shorter",
      BOT_ID,
      "Hello, how are you doing today?",
      10,
      5,
    );
    expect(decide(update, BOT_ID)).toEqual({
      kind: "refine",
      previous: "Hello, how are you doing today?",
      instruction: "make it shorter",
      replyTo: 10,
    });
  });

  it("replyTo uses the new message's message_id, not the replied-to id", () => {
    const update = replyUpdate("more formal", BOT_ID, "Hey there!", 77, 3);
    const result = decide(update, BOT_ID);
    expect(result.kind).toBe("refine");
    if (result.kind === "refine") {
      expect(result.replyTo).toBe(77);
    }
  });
});

describe("decide — step 3 edges: NOT refine when reply is not to bot", () => {
  it("reply to another human (reply.from.id !== botId) → fresh, not refine", () => {
    const update = replyUpdate("that's funny", HUMAN_ID, "some human said this", 10, 5);
    expect(decide(update, BOT_ID)).toEqual({
      kind: "fresh",
      text: "that's funny",
      replyTo: 10,
    });
  });

  it("reply to bot message with NO text (undefined) → fresh (falls through to step 4)", () => {
    const update = replyUpdate("what did you send?", BOT_ID, undefined, 15, 6);
    expect(decide(update, BOT_ID)).toEqual({
      kind: "fresh",
      text: "what did you send?",
      replyTo: 15,
    });
  });
});

describe("decide — step 4: fresh translation", () => {
  it("normal English phrase → fresh with correct text and replyTo", () => {
    const update = textUpdate("Good morning, everyone!", 7);
    expect(decide(update, BOT_ID)).toEqual({
      kind: "fresh",
      text: "Good morning, everyone!",
      replyTo: 7,
    });
  });

  it("normal Russian (Cyrillic) phrase → fresh (language-agnostic)", () => {
    const update = textUpdate("Привет, как дела?", 8);
    expect(decide(update, BOT_ID)).toEqual({
      kind: "fresh",
      text: "Привет, как дела?",
      replyTo: 8,
    });
  });

  it("text that starts with a digit (not aside prefix) → fresh", () => {
    const update = textUpdate("3 tickets please", 9);
    expect(decide(update, BOT_ID)).toEqual({
      kind: "fresh",
      text: "3 tickets please",
      replyTo: 9,
    });
  });

  it("empty string (no leading aside char) falls to fresh — boundary", () => {
    // An empty string has no text? No: empty string is falsy so !msg.text is true → ignore
    const update: TgUpdate = {
      message: {
        message_id: 11,
        text: "",
        chat: { id: CHAT_ID, type: "group" },
      },
    };
    // empty string is falsy → step 1 catches it → ignore
    expect(decide(update, BOT_ID)).toEqual({ kind: "ignore" });
  });
});
