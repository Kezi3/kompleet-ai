import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetSdkMocks, anthropicCreate, openaiCreate, claudeText, chatText } from "./sdk-mocks";

vi.mock("@anthropic-ai/sdk", async () => {
  const m = await import("./sdk-mocks");
  return {
    default: class {
      messages = { create: m.anthropicCreate };
    },
  };
});
vi.mock("openai", async () => {
  const m = await import("./sdk-mocks");
  return {
    default: class {
      chat = { completions: { create: m.openaiCreate } };
    },
  };
});

import {
  getPrimaryProvider,
  getProviderWithFallback,
  ProviderWithFallback,
} from "../../src/lib/ai/providers/factory";
import type {
  AIProvider,
  CategoryPrediction,
} from "../../src/lib/ai/providers/types";

function stub(
  name: string,
  result: CategoryPrediction | Error,
): AIProvider & { calls: number } {
  return {
    name,
    calls: 0,
    async isAvailable() {
      return true;
    },
    async categorize() {
      this.calls++;
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const req = { description: "x", amount: 1, transactionType: "debit" as const };

beforeEach(() => {
  resetSdkMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.unstubAllEnvs();
  for (const k of [
    "AI_PROVIDER",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "OPENAI_API_KEY",
    "KIMI_API_KEY",
    "MOONSHOT_API_KEY",
  ]) {
    vi.stubEnv(k, "");
  }
});

describe("getPrimaryProvider", () => {
  it("falls through to the rule based provider when no keys are set", async () => {
    expect((await getPrimaryProvider()).name).toBe("fallback");
  });

  it("prefers Claude over OpenAI and Kimi", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubEnv("KIMI_API_KEY", "k");
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    expect((await getPrimaryProvider()).name).toBe("claude");
  });

  it("honours AI_PROVIDER when that provider is available", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubEnv("AI_PROVIDER", "openai");
    expect((await getPrimaryProvider()).name).toBe("openai");
  });

  it("ignores AI_PROVIDER when that provider has no key", async () => {
    vi.stubEnv("AI_PROVIDER", "kimi");
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect((await getPrimaryProvider()).name).toBe("openai");
  });
});

describe("ProviderWithFallback", () => {
  it("returns the first confident answer", async () => {
    const a = stub("a", { category: "Sales", confidence: 90, reasoning: "" });
    const b = stub("b", { category: "Revenue", confidence: 90, reasoning: "" });
    const out = await new ProviderWithFallback([a, b]).categorize(req);
    expect(out.category).toBe("Sales");
    expect(b.calls).toBe(0);
  });

  it("moves on when a provider throws", async () => {
    const a = stub("a", new Error("boom"));
    const b = stub("b", { category: "Revenue", confidence: 80, reasoning: "" });
    const out = await new ProviderWithFallback([a, b]).categorize(req);
    expect(out.category).toBe("Revenue");
  });

  it("moves on when confidence is below 50, but keeps the last answer", async () => {
    const a = stub("a", { category: "Sales", confidence: 40, reasoning: "" });
    const b = stub("b", { category: "Other Expense", confidence: 20, reasoning: "" });
    const out = await new ProviderWithFallback([a, b]).categorize(req);
    expect(a.calls).toBe(1);
    expect(out.category).toBe("Other Expense");
  });

  it("throws when every provider fails", async () => {
    const p = new ProviderWithFallback([
      stub("a", new Error("one")),
      stub("b", new Error("two")),
    ]);
    await expect(p.categorize(req)).rejects.toThrow(
      "All providers failed. Last error: two",
    );
  });

  it("chains real providers: Claude error, then OpenAI answer", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "k");
    anthropicCreate.mockRejectedValue(new Error("overloaded"));
    openaiCreate.mockResolvedValue(
      chatText('{"category":"Bank Fees","confidence":88,"reasoning":"fee"}'),
    );
    const p = await getProviderWithFallback();
    const out = await p.categorize({ description: "SMS charge", amount: 50, transactionType: "debit" });
    expect(out.category).toBe("Bank Fees");
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("ends at the rule based provider when the LLM is unsure", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    anthropicCreate.mockResolvedValue(
      claudeText('{"category":"Other Expense","confidence":35,"reasoning":"?"}'),
    );
    const p = await getProviderWithFallback();
    const out = await p.categorize({ description: "Bank charge", amount: 50, transactionType: "debit" });
    expect(out.category).toBe("Bank Fees");
  });
});
