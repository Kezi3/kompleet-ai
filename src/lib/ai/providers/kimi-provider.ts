/**
 * Kimi Provider
 * ==============
 * AI categorization provider using Moonshot AI's Kimi 2.5 model
 * Uses OpenAI-compatible API
 */

import OpenAI from "openai";
import { AIProvider, CategoryPrediction, CategorizationRequest } from "./types";

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

export class KimiProvider implements AIProvider {
  name = "kimi";
  private client: OpenAI | null = null;
  private model: string;

  constructor(apiKey?: string, model: string = "moonshot-v1-8k") {
    this.model = model;

    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: "https://api.moonshot.cn/v1",
      });
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.client) return true;

    const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    if (!apiKey) return false;

    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.moonshot.cn/v1",
    });
    return true;
  }

  async categorize(
    request: CategorizationRequest,
  ): Promise<CategoryPrediction> {
    if (!this.client) {
      throw new Error("Kimi provider not initialized. API key missing.");
    }

    const prompt = this.buildPrompt(request);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a financial transaction categorization expert for Nigerian businesses. Analyze transactions and categorize them accurately based on Nigerian accounting standards.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from Kimi");
      }

      return this.parseResponse(content);
    } catch (error) {
      console.error("Kimi categorization error:", error);
      throw new Error(
        `Kimi provider error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private buildPrompt(request: CategorizationRequest): string {
    return `Categorize this Nigerian business transaction:

Description: ${request.description}
Amount: ₦${request.amount.toLocaleString()}
Type: ${request.transactionType}
${request.date ? `Date: ${request.date}` : ""}
${request.merchant ? `Merchant: ${request.merchant}` : ""}

Available Categories:
${TRANSACTION_CATEGORIES.join(", ")}

Respond in JSON format:
{
  "category": "Selected Category",
  "confidence": 85,
  "reasoning": "Brief explanation",
  "alternativeCategories": [
    {"category": "Alternative 1", "confidence": 60},
    {"category": "Alternative 2", "confidence": 40}
  ]
}`;
  }

  private parseResponse(content: string): CategoryPrediction {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        category: parsed.category || "Uncategorized",
        confidence: Math.min(Math.max(parsed.confidence || 50, 0), 100),
        reasoning: parsed.reasoning || "No reasoning provided",
        alternativeCategories: parsed.alternativeCategories || [],
      };
    } catch (error) {
      console.error("Failed to parse Kimi response:", error);
      return {
        category: "Uncategorized",
        confidence: 30,
        reasoning: "Failed to parse AI response",
        alternativeCategories: [],
      };
    }
  }
}
