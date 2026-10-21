/**
 * AI Provider Types
 * ==================
 * Common types and interfaces for AI categorization providers
 */

export interface CategoryPrediction {
  category: string;
  confidence: number; // 0-100
  reasoning: string;
  alternativeCategories?: Array<{ category: string; confidence: number }>;
}

export interface CategorizationRequest {
  description: string;
  amount: number;
  transactionType: "credit" | "debit";
  date?: string;
  merchant?: string;
}

export interface CategorizationResponse {
  prediction: CategoryPrediction;
  provider: string;
  timestamp: Date;
}

/**
 * AI Provider Interface
 * All AI providers must implement this interface
 */
export interface AIProvider {
  /**
   * Name of the provider (e.g., 'openai', 'kimi', 'fallback')
   */
  name: string;

  /**
   * Whether this provider is available (API key configured, etc.)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Categorize a single transaction
   */
  categorize(request: CategorizationRequest): Promise<CategoryPrediction>;

  /**
   * Categorize multiple transactions in batch
   */
  categorizeBatch?(
    requests: CategorizationRequest[],
  ): Promise<CategoryPrediction[]>;
}

/**
 * Provider Configuration
 */
export interface ProviderConfig {
  provider: "openai" | "claude" | "kimi" | "fallback";
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
