import { describe, it, expect } from "vitest";
import { hasValidSecret, isAllowedChat } from "./auth";
import type { Env, TgUpdate } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnv(partial: Partial<Env> = {}): Env {
  return {
    BOT_TOKEN: "bot-token",
    LLM_API_KEY: "llm-key",
    WEBHOOK_SECRET: "super-secret",
    ALLOWED_CHAT_ID: "-100123456789",
    ...partial,
  };
}

/**
 * Build a real Request with optional secret header.
 * Vitest 4.x runs in Node 24+ which provides a global Request/Headers.
 */
function makeRequest(secretHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (secretHeader !== undefined) {
    headers["X-Telegram-Bot-Api-Secret-Token"] = secretHeader;
  }
  return new Request("https://example.com/webhook", { headers });
}

function makeUpdate(chatId?: number): TgUpdate {
  if (chatId === undefined) return {};
  return {
    message: {
      message_id: 1,
      chat: { id: chatId, type: "group" },
    },
  };
}

// ---------------------------------------------------------------------------
// hasValidSecret
// ---------------------------------------------------------------------------

describe("hasValidSecret", () => {
  it("returns true when header exactly matches env.WEBHOOK_SECRET", () => {
    const env = makeEnv({ WEBHOOK_SECRET: "my-secret-token" });
    const req = makeRequest("my-secret-token");
    expect(hasValidSecret(req, env)).toBe(true);
  });

  it("returns false when header is missing", () => {
    const env = makeEnv({ WEBHOOK_SECRET: "my-secret-token" });
    const req = makeRequest(); // no header
    expect(hasValidSecret(req, env)).toBe(false);
  });

  it("returns false when header value is wrong", () => {
    const env = makeEnv({ WEBHOOK_SECRET: "my-secret-token" });
    const req = makeRequest("wrong-token");
    expect(hasValidSecret(req, env)).toBe(false);
  });

  it("returns false when header is empty string and secret is non-empty", () => {
    const env = makeEnv({ WEBHOOK_SECRET: "my-secret-token" });
    const req = makeRequest("");
    expect(hasValidSecret(req, env)).toBe(false);
  });

  // Edge case (degenerate config): an empty secret accepts an empty header.
  // Documents current behavior; production should never set an empty WEBHOOK_SECRET.
  it("returns true when both header and secret are the same empty string", () => {
    const env = makeEnv({ WEBHOOK_SECRET: "" });
    const req = makeRequest("");
    expect(hasValidSecret(req, env)).toBe(true);
  });

  it("is case-sensitive (wrong case → false)", () => {
    const env = makeEnv({ WEBHOOK_SECRET: "SecretToken" });
    const req = makeRequest("secrettoken");
    expect(hasValidSecret(req, env)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAllowedChat
// ---------------------------------------------------------------------------

describe("isAllowedChat", () => {
  it("returns true when chat.id matches Number(ALLOWED_CHAT_ID)", () => {
    // env stores it as a numeric string; function coerces with Number()
    const env = makeEnv({ ALLOWED_CHAT_ID: "-100123456789" });
    const update = makeUpdate(-100123456789);
    expect(isAllowedChat(update, env)).toBe(true);
  });

  it("returns false when chat.id does not match", () => {
    const env = makeEnv({ ALLOWED_CHAT_ID: "-100123456789" });
    const update = makeUpdate(-100000000001);
    expect(isAllowedChat(update, env)).toBe(false);
  });

  it("handles string env value matching a positive numeric chat id", () => {
    const env = makeEnv({ ALLOWED_CHAT_ID: "9876" });
    const update = makeUpdate(9876);
    expect(isAllowedChat(update, env)).toBe(true);
  });

  it("returns false when update has no message (message is absent)", () => {
    const env = makeEnv({ ALLOWED_CHAT_ID: "-100123456789" });
    const update: TgUpdate = {}; // no message
    expect(isAllowedChat(update, env)).toBe(false);
  });
});
