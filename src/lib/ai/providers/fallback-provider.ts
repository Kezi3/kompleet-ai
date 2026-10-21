/**
 * Fallback Provider
 * ==================
 * Rule-based categorization provider that doesn't require AI API
 * Uses keyword matching and transaction patterns
 */

import { AIProvider, CategoryPrediction, CategorizationRequest } from "./types";

interface CategoryRule {
  category: string;
  keywords: string[];
  transactionType?: "credit" | "debit";
  amountRange?: { min?: number; max?: number };
  confidence: number;
}

const CATEGORY_RULES: CategoryRule[] = [
  // Income categories
  {
    category: "Revenue",
    keywords: [
      "sales",
      "revenue",
      "income",
      "payment received",
      "customer payment",
    ],
    transactionType: "credit",
    confidence: 85,
  },
  {
    category: "Salary",
    keywords: ["salary", "wages", "payroll", "staff payment"],
    transactionType: "credit",
    confidence: 90,
  },
  {
    category: "Interest Income",
    keywords: ["interest", "dividend", "investment income"],
    transactionType: "credit",
    confidence: 85,
  },

  // Expense categories
  {
    category: "Salaries & Wages",
    keywords: ["salary", "wages", "payroll", "staff", "employee"],
    transactionType: "debit",
    confidence: 90,
  },
  {
    category: "Rent & Utilities",
    keywords: [
      "rent",
      "electricity",
      "ekedc",
      "ikedc",
      "phcn",
      "water",
      "dstv",
      "gotv",
      "startimes",
    ],
    transactionType: "debit",
    confidence: 85,
  },
  {
    category: "Telecommunications",
    keywords: [
      "mtn",
      "glo",
      "airtel",
      "9mobile",
      "internet",
      "data",
      "airtime",
      "spectranet",
    ],
    transactionType: "debit",
    confidence: 90,
  },
  {
    category: "Marketing & Advertising",
    keywords: [
      "marketing",
      "advertising",
      "promotion",
      "facebook ads",
      "google ads",
    ],
    transactionType: "debit",
    confidence: 85,
  },
  {
    category: "Travel & Transportation",
    keywords: [
      "fuel",
      "petrol",
      "diesel",
      "uber",
      "bolt",
      "taxi",
      "flight",
      "hotel",
    ],
    transactionType: "debit",
    confidence: 85,
  },
  {
    category: "Meals & Entertainment",
    keywords: ["restaurant", "food", "lunch", "dinner", "catering"],
    transactionType: "debit",
    confidence: 80,
  },
  {
    category: "Office Supplies",
    keywords: ["stationery", "office", "supplies", "printer", "paper"],
    transactionType: "debit",
    confidence: 85,
  },
  {
    category: "Professional Services",
    keywords: ["consulting", "legal", "accounting", "audit", "professional"],
    transactionType: "debit",
    confidence: 85,
  },
  {
    category: "Bank Fees",
    keywords: [
      "bank charge",
      "commission",
      "sms charge",
      "atm fee",
      "transfer fee",
    ],
    transactionType: "debit",
    confidence: 95,
  },
  {
    category: "Taxes & Levies",
    keywords: ["tax", "vat", "wht", "levy", "nrs"],
    transactionType: "debit",
    confidence: 90,
  },
  {
    category: "Equipment & Fixed Assets",
    keywords: [
      "equipment",
      "machinery",
      "computer",
      "laptop",
      "furniture",
      "vehicle",
    ],
    transactionType: "debit",
    amountRange: { min: 50000 },
    confidence: 80,
  },
  {
    category: "Insurance",
    keywords: ["insurance", "premium", "policy"],
    transactionType: "debit",
    confidence: 90,
  },

  // Transfer category
  {
    category: "Transfer",
    keywords: ["transfer", "moved", "internal transfer"],
    confidence: 70,
  },
];

export class FallbackProvider implements AIProvider {
  name = "fallback";

  async isAvailable(): Promise<boolean> {
    // Fallback provider is always available
    return true;
  }

  async categorize(
    request: CategorizationRequest,
  ): Promise<CategoryPrediction> {
    const description = request.description.toLowerCase();
    const amount = request.amount;
    const transactionType = request.transactionType;

    // Find matching rules
    const matches: Array<{ rule: CategoryRule; score: number }> = [];

    for (const rule of CATEGORY_RULES) {
      // Check transaction type match
      if (rule.transactionType && rule.transactionType !== transactionType) {
        continue;
      }

      // Check amount range
      if (rule.amountRange) {
        if (rule.amountRange.min && amount < rule.amountRange.min) continue;
        if (rule.amountRange.max && amount > rule.amountRange.max) continue;
      }

      // Check keyword matches
      let keywordMatches = 0;
      for (const keyword of rule.keywords) {
        if (description.includes(keyword.toLowerCase())) {
          keywordMatches++;
        }
      }

      if (keywordMatches > 0) {
        const score = (keywordMatches / rule.keywords.length) * rule.confidence;
        matches.push({ rule, score });
      }
    }

    // Sort by score and get the best match
    matches.sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      // No matches found, return uncategorized
      return {
        category: "Uncategorized",
        confidence: 30,
        reasoning: "No matching rules found for this transaction",
        alternativeCategories: [],
      };
    }

    const bestMatch = matches[0];
    const alternatives = matches.slice(1, 3).map((m) => ({
      category: m.rule.category,
      confidence: Math.round(m.score),
    }));

    return {
      category: bestMatch.rule.category,
      confidence: Math.round(bestMatch.score),
      reasoning: `Matched keywords: ${bestMatch.rule.keywords
        .filter((k) => description.includes(k.toLowerCase()))
        .join(", ")}`,
      alternativeCategories: alternatives,
    };
  }
}
