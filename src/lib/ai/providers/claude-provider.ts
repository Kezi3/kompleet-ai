/**
 * Claude Provider
 * ================
 * AI categorization provider using Anthropic's Claude models
 */

import Anthropic from "@anthropic-ai/sdk";
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

export class ClaudeProvider implements AIProvider {
  name = "claude";
  private client: Anthropic | null = null;
  private model: string;

  constructor(apiKey?: string, model: string = "claude-3-5-sonnet-20241022") {
    this.model = model;

    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.client) return true;

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) return false;

    this.client = new Anthropic({ apiKey });
    return true;
  }

  async categorize(
    request: CategorizationRequest,
  ): Promise<CategoryPrediction> {
    if (!this.client) {
      throw new Error("Claude provider not initialized. API key missing.");
    }

    const prompt = this.buildPrompt(request);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      return this.parseResponse(content.text);
    } catch (error) {
      console.error("Claude categorization error:", error);
      throw new Error(
        `Claude provider error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private buildPrompt(request: CategorizationRequest): string {
    return `You are a financial transaction categorization expert for Nigerian businesses. Analyze this transaction and categorize it accurately based on Nigerian accounting standards.

Transaction Details:
- Description: ${request.description}
- Amount: ₦${request.amount.toLocaleString()}
- Type: ${request.transactionType}
${request.date ? `- Date: ${request.date}` : ""}
${request.merchant ? `- Merchant: ${request.merchant}` : ""}

Available Categories:
${TRANSACTION_CATEGORIES.join(", ")}

Respond in JSON format:
{
  "category": "Selected Category",
  "confidence": 85,
  "reasoning": "Brief explanation of why this category was chosen",
  "alternativeCategories": [
    {"category": "Alternative 1", "confidence": 60},
    {"category": "Alternative 2", "confidence": 40}
  ]
}

Rules:
1. Choose the MOST specific category that matches the transaction
2. Confidence should be 0-100 (0 = not sure, 100 = very sure)
3. Consider Nigerian business context and common transaction patterns
4. Provide 2-3 alternative categories if confidence < 80`;
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
      console.error("Failed to parse Claude response:", error);
      return {
        category: "Uncategorized",
        confidence: 30,
        reasoning: "Failed to parse AI response",
        alternativeCategories: [],
      };
    }
  }
}
