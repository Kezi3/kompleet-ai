import { describe, it, expect } from "vitest";
import { FallbackProvider } from "../../src/lib/ai/providers/fallback-provider";

const p = new FallbackProvider();

describe("FallbackProvider (rule based)", () => {
  it("is always available", async () => {
    expect(await p.isAvailable()).toBe(true);
  });

  it("matches keywords to a category", async () => {
    const out = await p.categorize({
      description: "Diesel for generator and taxi fare",
      amount: 15000,
      transactionType: "debit",
    });
    expect(out.category).toBe("Travel & Transportation");
    expect(out.reasoning).toContain("diesel");
  });

  it("respects transaction type", async () => {
    const credit = await p.categorize({
      description: "Customer payment for sales invoice",
      amount: 80000,
      transactionType: "credit",
    });
    expect(credit.category).toBe("Revenue");
  });

  it("returns ranked alternatives", async () => {
    const out = await p.categorize({
      description: "Staff salary payroll",
      amount: 400000,
      transactionType: "debit",
    });
    expect(out.category).toBe("Salaries & Wages");
    expect(out.alternativeCategories!.length).toBeLessThanOrEqual(2);
  });

  it("returns Uncategorized with low confidence when nothing matches", async () => {
    const out = await p.categorize({
      description: "zzqx",
      amount: 1,
      transactionType: "debit",
    });
    expect(out).toMatchObject({ category: "Uncategorized", confidence: 30 });
  });
});
