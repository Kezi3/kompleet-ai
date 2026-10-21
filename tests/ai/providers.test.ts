import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  anthropicCreate,
  openaiCreate,
  anthropicCtorArgs,
  openaiCtorArgs,
  resetSdkMocks,
  claudeText,
  chatText,
} from "./sdk-mocks";

vi.mock("@anthropic-ai/sdk", async () => {
  const m = await import("./sdk-mocks");
  return {
    default: class {
      messages = { create: m.anthropicCreate };
      constructor(opts: unknown) {
        m.anthropicCtorArgs.push(opts);
      }
    },
  };
});

vi.mock("openai", async () => {
  const m = await import("./sdk-mocks");
  return {
    default: class {
      chat = { completions: { create: m.openaiCreate } };
      constructor(opts: unknown) {
        m.openaiCtorArgs.push(opts);
      }
    },
  };
});

import { ClaudeProvider } from "../../src/lib/ai/providers/claude-provider";
import { OpenAIProvider } from "../../src/lib/ai/providers/openai-provider";
import { KimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import type { CategorizationRequest } from "../../src/lib/ai/providers/types";

const request: CategorizationRequest = {
  description: "Monthly office rent",
  amount: 250000,
  transactionType: "debit",
  date: "2026-01-31",
  merchant: "Sample Properties",
};

const goodJson = JSON.stringify({
  category: "Rent & Utilities",
  confidence: 92,
  reasoning: "Recurring rent payment",
  alternativeCategories: [{ category: "Other Expense", confidence: 20 }],
});

beforeEach(() => {
  resetSdkMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.unstubAllEnvs();
  for (const k of [
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "OPENAI_API_KEY",
    "KIMI_API_KEY",
    "MOONSHOT_API_KEY",
  ]) {
    vi.stubEnv(k, "");
  }
});

describe("ClaudeProvider", () => {
  it("is unavailable without an API key", async () => {
    expect(await new ClaudeProvider().isAvailable()).toBe(false);
  });

  it("becomes available from ANTHROPIC_API_KEY or CLAUDE_API_KEY", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    expect(await new ClaudeProvider().isAvailable()).toBe(true);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    expect(await new ClaudeProvider().isAvailable()).toBe(true);
  });

  it("throws when categorising without a client", async () => {
    await expect(new ClaudeProvider().categorize(request)).rejects.toThrow(
      /API key missing/,
    );
  });

  it("parses a JSON answer and sends the configured model", async () => {
    anthropicCreate.mockResolvedValue(
      claudeText(`Here you go:\n${goodJson}\nThanks`),
    );
    const p = new ClaudeProvider("test-key", "claude-test-model");
    const out = await p.categorize(request);
    expect(out.category).toBe("Rent & Utilities");
    expect(out.confidence).toBe(92);
    expect(out.alternativeCategories).toHaveLength(1);
    const call = anthropicCreate.mock.calls[0]![0];
    expect(call.model).toBe("claude-test-model");
    expect(call.messages[0].content).toContain("Monthly office rent");
    expect(call.messages[0].content).toContain("Merchant: Sample Properties");
  });

  it("clamps confidence to 0..100", async () => {
    anthropicCreate.mockResolvedValue(
      claudeText(JSON.stringify({ category: "Sales", confidence: 250 })),
    );
    const out = await new ClaudeProvider("k").categorize(request);
    expect(out.confidence).toBe(100);
    expect(out.reasoning).toBe("No reasoning provided");
  });

  it("returns Uncategorized at 30 when the answer has no JSON", async () => {
    anthropicCreate.mockResolvedValue(claudeText("I am not sure"));
    const out = await new ClaudeProvider("k").categorize(request);
    expect(out).toMatchObject({ category: "Uncategorized", confidence: 30 });
  });

  it("rejects non text content blocks", async () => {
    anthropicCreate.mockResolvedValue({ content: [{ type: "tool_use" }] });
    await expect(new ClaudeProvider("k").categorize(request)).rejects.toThrow(
      /Claude provider error: Unexpected response type/,
    );
  });

  it("wraps SDK errors", async () => {
    anthropicCreate.mockRejectedValue(new Error("rate limited"));
    await expect(new ClaudeProvider("k").categorize(request)).rejects.toThrow(
      "Claude provider error: rate limited",
    );
  });
});

describe("OpenAIProvider", () => {
  it("is available only with OPENAI_API_KEY", async () => {
    expect(await new OpenAIProvider().isAvailable()).toBe(false);
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    expect(await new OpenAIProvider().isAvailable()).toBe(true);
  });

  it("parses a chat completion", async () => {
    openaiCreate.mockResolvedValue(chatText(goodJson));
    const out = await new OpenAIProvider("k", "gpt-test").categorize(request);
    expect(out.category).toBe("Rent & Utilities");
    const call = openaiCreate.mock.calls[0]![0];
    expect(call.model).toBe("gpt-test");
    expect(call.messages[0].role).toBe("system");
  });

  it("throws on an empty completion", async () => {
    openaiCreate.mockResolvedValue(chatText(null));
    await expect(new OpenAIProvider("k").categorize(request)).rejects.toThrow(
      "OpenAI provider error: No response from OpenAI",
    );
  });

  it("falls back to Uncategorized on malformed JSON", async () => {
    openaiCreate.mockResolvedValue(chatText("{not json}"));
    const out = await new OpenAIProvider("k").categorize(request);
    expect(out).toMatchObject({ category: "Uncategorized", confidence: 30 });
  });
});

describe("KimiProvider", () => {
  it("uses the Moonshot OpenAI compatible endpoint", async () => {
    new KimiProvider("k");
    expect(openaiCtorArgs[0]).toMatchObject({
      baseURL: "https://api.moonshot.cn/v1",
    });
  });

  it("is available from KIMI_API_KEY or MOONSHOT_API_KEY", async () => {
    expect(await new KimiProvider().isAvailable()).toBe(false);
    vi.stubEnv("MOONSHOT_API_KEY", "test-key");
    expect(await new KimiProvider().isAvailable()).toBe(true);
  });

  it("parses a chat completion", async () => {
    openaiCreate.mockResolvedValue(chatText(goodJson));
    const out = await new KimiProvider("k").categorize(request);
    expect(out.category).toBe("Rent & Utilities");
    expect(openaiCreate.mock.calls[0]![0].model).toBe("moonshot-v1-8k");
  });

  it("wraps SDK errors", async () => {
    openaiCreate.mockRejectedValue(new Error("timeout"));
    await expect(new KimiProvider("k").categorize(request)).rejects.toThrow(
      "Kimi provider error: timeout",
    );
  });
});

it("never constructs an Anthropic client without a key", () => {
  new ClaudeProvider();
  expect(anthropicCtorArgs).toHaveLength(0);
});
