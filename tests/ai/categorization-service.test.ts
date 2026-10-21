import { describe, it, expect, vi, beforeEach } from "vitest";

const categorize = vi.fn();
vi.mock("../../src/lib/ai/providers/factory", () => ({
  getProviderWithFallback: async () => ({
    name: "mock",
    isAvailable: async () => true,
    categorize,
  }),
}));

import {
  categorizeTransactions,
  categorizeTransaction,
  getCategorySuggestions,
  getAvailableCategories,
} from "../../src/lib/ai/categorizationService";
import type { Transaction } from "../../src/lib/ai/transaction";

const tx = (id: string, description: string): Transaction => ({
  id,
  date: "2026-02-01",
  description,
  amount: 1000,
  type: "debit",
});

beforeEach(() => {
  categorize.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("categorizationService", () => {
  it("maps a provider prediction onto the transaction", async () => {
    categorize.mockResolvedValue({ category: "Bank Fees", confidence: 80, reasoning: "fee" });
    const out = await categorizeTransaction(tx("t1", "SMS charge"));
    expect(out).toMatchObject({ transactionId: "t1", category: "Bank Fees", confidence: 80 });
    expect(categorize).toHaveBeenCalledWith({
      description: "SMS charge",
      amount: 1000,
      transactionType: "debit",
      date: "2026-02-01",
    });
  });

  it("counts successes and failures in a batch", async () => {
    categorize
      .mockResolvedValueOnce({ category: "Sales", confidence: 90, reasoning: "" })
      .mockRejectedValueOnce(new Error("down"));
    const res = await categorizeTransactions([tx("a", "sale"), tx("b", "??")]);
    expect(res.totalProcessed).toBe(2);
    expect(res.successCount).toBe(1);
    expect(res.failureCount).toBe(1);
    expect(res.predictions[1]).toMatchObject({ transactionId: "b", category: "Uncategorized", confidence: 0 });
    expect(res.averageConfidence).toBe(45);
  });

  it("returns zero average for an empty batch", async () => {
    const res = await categorizeTransactions([]);
    expect(res.averageConfidence).toBe(0);
  });

  it("returns suggestions as 0..1 confidences, capped by limit", async () => {
    categorize.mockResolvedValue({
      category: "Sales",
      confidence: 70,
      reasoning: "",
      alternativeCategories: [
        { category: "Revenue", confidence: 50 },
        { category: "Other Income", confidence: 20 },
      ],
    });
    const s = await getCategorySuggestions("invoice payment", 2);
    expect(s).toEqual([
      { category: "Sales", confidence: 0.7 },
      { category: "Revenue", confidence: 0.5 },
    ]);
  });

  it("returns no suggestions when the provider fails", async () => {
    categorize.mockRejectedValue(new Error("down"));
    expect(await getCategorySuggestions("x")).toEqual([]);
  });

  it("exposes the category list", () => {
    const cats = getAvailableCategories();
    expect(cats).toContain("Taxes & Levies");
    expect(cats.at(-1)).toBe("Uncategorized");
  });
});
