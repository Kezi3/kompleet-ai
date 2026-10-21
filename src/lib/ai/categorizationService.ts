/**
 * AI Categorization Service
 * Uses AI providers (Kimi, OpenAI, or fallback rules) to categorize transactions
 * with automatic fallback support
 */

import type { Transaction } from "./transaction";
import { getProviderWithFallback } from "./providers/factory";
import type { CategoryPrediction as ProviderPrediction } from "./providers/types";

export interface CategoryPrediction {
  transactionId: string;
  category: string;
  confidence: number;
  reasoning: string;
  alternativeCategories?: Array<{ category: string; confidence: number }>;
}

export interface CategorizationResult {
  predictions: CategoryPrediction[];
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  averageConfidence: number;
}

// Standard transaction categories for Nigerian businesses
const TRANSACTION_CATEGORIES = [
  "Revenue",
  "Sales",
  "Refunds",
  "Cost of Goods Sold",
  "Salaries & Wages",
  "Rent & Utilities",
  "Office Supplies",
  "Marketing & Advertising",
  "Professional Services",
  "Travel & Transportation",
  "Meals & Entertainment",
  "Insurance",
  "Taxes & Levies",
  "Loan Repayment",
  "Equipment & Fixed Assets",
  "Maintenance & Repairs",
  "Telecommunications",
  "Bank Fees",
  "Interest Income",
  "Interest Expense",
  "Dividends",
  "Other Income",
  "Other Expense",
  "Transfer",
  "Uncategorized",
];

// Deprecated OpenAI client removed - now using provider abstraction

/**
 * Categorize transactions using AI
 */
export async function categorizeTransactions(
  transactions: Transaction[],
  userContext?: {
    businessType?: string;
    industry?: string;
    previousCategories?: Record<string, string>;
  },
): Promise<CategorizationResult> {
  const predictions: CategoryPrediction[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const transaction of transactions) {
    try {
      const prediction = await categorizeTransaction(transaction, userContext);
      predictions.push(prediction);
      successCount++;
    } catch (error) {
      console.error(
        `Failed to categorize transaction ${transaction.id}:`,
        error,
      );
      predictions.push({
        transactionId: transaction.id,
        category: "Uncategorized",
        confidence: 0,
        reasoning: "Failed to categorize",
      });
      failureCount++;
    }
  }

  const averageConfidence =
    predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.confidence, 0) /
        predictions.length
      : 0;

  return {
    predictions,
    totalProcessed: transactions.length,
    successCount,
    failureCount,
    averageConfidence,
  };
}

/**
 * Categorize a single transaction
 */
export async function categorizeTransaction(
  transaction: Transaction,
  userContext?: {
    businessType?: string;
    industry?: string;
    previousCategories?: Record<string, string>;
  },
): Promise<CategoryPrediction> {
  try {
    const provider = await getProviderWithFallback();

    const prediction = await provider.categorize({
      description: transaction.description,
      amount: transaction.amount,
      transactionType: transaction.type as "credit" | "debit",
      date: transaction.date,
    });

    return {
      transactionId: transaction.id,
      category: prediction.category,
      confidence: prediction.confidence,
      reasoning: prediction.reasoning,
      alternativeCategories: prediction.alternativeCategories,
    };
  } catch (error) {
    console.error("Categorization failed:", error);
    throw error;
  }
}

/**
 * @deprecated Old prompt builder - no longer used with provider abstraction
 */
function buildCategorizationPrompt(
  transaction: Transaction,
  userContext?: {
    businessType?: string;
    industry?: string;
    previousCategories?: Record<string, string>;
  },
): string {
  const categories = TRANSACTION_CATEGORIES.join(", ");

  let contextInfo = "";
  if (userContext?.businessType) {
    contextInfo += `\nBusiness Type: ${userContext.businessType}`;
  }
  if (userContext?.industry) {
    contextInfo += `\nIndustry: ${userContext.industry}`;
  }

  const previousExamples =
    userContext?.previousCategories &&
    Object.keys(userContext.previousCategories).length > 0
      ? `\nPrevious categorizations (for reference):\n${Object.entries(
          userContext.previousCategories,
        )
          .slice(0, 5)
          .map(([desc, cat]) => `- "${desc}" → ${cat}`)
          .join("\n")}`
      : "";

  return `You are an expert accountant helping to categorize business transactions for a Nigerian company.

${contextInfo}${previousExamples}

Categorize the following transaction:
- Date: ${transaction.date}
- Amount: ${transaction.amount} ${transaction.currency || "NGN"}
- Type: ${transaction.type}
- Description: ${transaction.description}
- Counterparty: ${transaction.description || "Unknown"}

Available categories:
${categories}

Respond in JSON format with:
{
  "category": "chosen category",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "alternatives": [
    {"category": "alternative", "confidence": 0.0-1.0}
  ]
}

Rules:
1. Choose the MOST specific category that matches the transaction
2. Confidence should reflect how certain you are (0.0 = not sure, 1.0 = very sure)
3. For ambiguous transactions, choose "Other Income" or "Other Expense"
4. Consider Nigerian business context and tax implications
5. Provide 2-3 alternative categories if confidence < 0.9`;
}

/**
 * @deprecated Old response parser - no longer used with provider abstraction
 */
function parseCategorizationResponse(
  responseText: string,
  transactionId: string,
): CategoryPrediction {
  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      transactionId,
      category: parsed.category || "Uncategorized",
      confidence: Math.min(Math.max(parsed.confidence || 0, 0), 1),
      reasoning: parsed.reasoning || "",
      alternativeCategories: parsed.alternatives || [],
    };
  } catch (error) {
    console.error("Failed to parse categorization response:", error);
    return {
      transactionId,
      category: "Uncategorized",
      confidence: 0,
      reasoning: "Failed to parse AI response",
    };
  }
}

/**
 * Get category suggestions based on description
 * Uses AI provider abstraction for suggestions
 */
export async function getCategorySuggestions(
  description: string,
  limit: number = 5,
): Promise<Array<{ category: string; confidence: number }>> {
  try {
    const provider = await getProviderWithFallback();

    const prediction = await provider.categorize({
      description,
      amount: 0, // Not relevant for suggestions
      transactionType: "debit", // Default
    });

    // Return the main category plus alternatives
    const suggestions = [
      {
        category: prediction.category,
        confidence: prediction.confidence / 100,
      },
      ...(prediction.alternativeCategories || []).map((alt) => ({
        category: alt.category,
        confidence: alt.confidence / 100,
      })),
    ];

    return suggestions.slice(0, limit);
  } catch (error) {
    console.error("Failed to get category suggestions:", error);
    return [];
  }
}

/**
 * Get available categories
 */
export function getAvailableCategories(): string[] {
  return TRANSACTION_CATEGORIES;
}
