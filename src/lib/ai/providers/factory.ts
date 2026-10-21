/**
 * AI Provider Factory
 * ====================
 * Creates and manages AI categorization providers with fallback support
 */

import { AIProvider, ProviderConfig } from "./types";
import { OpenAIProvider } from "./openai-provider";
import { ClaudeProvider } from "./claude-provider";
import { KimiProvider } from "./kimi-provider";
import { FallbackProvider } from "./fallback-provider";

/**
 * Provider priority order: Claude first.
 * OpenAI and Kimi remain registered as fallbacks; rule-based FallbackProvider last.
 */
const DEFAULT_PROVIDER_ORDER: Array<"openai" | "claude" | "kimi" | "fallback"> =
  [
    "claude",
    "openai",
    "kimi",
    "fallback",
  ];

/** Default Claude model for bulk categorization (short classification). */
const DEFAULT_CLAUDE_MODEL =
  process.env.ANTHROPIC_CATEGORIZE_MODEL || "claude-3-5-haiku-20241022";

/**
 * Create a provider instance based on configuration
 */
function createProvider(config: ProviderConfig): AIProvider {
  switch (config.provider) {
    case "openai":
      return new OpenAIProvider(config.apiKey, config.model);
    case "claude":
      return new ClaudeProvider(
        config.apiKey,
        config.model || DEFAULT_CLAUDE_MODEL,
      );
    case "kimi":
      return new KimiProvider(config.apiKey, config.model);
    case "fallback":
      return new FallbackProvider();
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Get the primary AI provider based on environment configuration
 */
export async function getPrimaryProvider(): Promise<AIProvider> {
  // Check environment variable for preferred provider
  const preferredProvider = process.env.AI_PROVIDER as
    | "openai"
    | "claude"
    | "kimi"
    | "fallback"
    | undefined;

  if (preferredProvider) {
    const provider = createProvider({ provider: preferredProvider });
    const isAvailable = await provider.isAvailable();

    if (isAvailable) {
      return provider;
    }
  }

  // Try providers in priority order
  for (const providerType of DEFAULT_PROVIDER_ORDER) {
    const provider = createProvider({ provider: providerType });
    const isAvailable = await provider.isAvailable();

    if (isAvailable) {
      return provider;
    }
  }

  // This should never happen since fallback is always available
  throw new Error("No AI provider available");
}

/**
 * Get a provider with automatic fallback
 * If the primary provider fails, it will automatically try the next available provider
 */
export class ProviderWithFallback implements AIProvider {
  name = "provider-with-fallback";
  private providers: AIProvider[] = [];

  constructor(providers?: AIProvider[]) {
    if (providers) {
      this.providers = providers;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.providers.length > 0) {
      return true;
    }

    // Initialize providers
    for (const providerType of DEFAULT_PROVIDER_ORDER) {
      const provider = createProvider({ provider: providerType });
      const isAvailable = await provider.isAvailable();

      if (isAvailable) {
        this.providers.push(provider);
      }
    }

    return this.providers.length > 0;
  }

  async categorize(request: any): Promise<any> {
    if (this.providers.length === 0) {
      await this.isAvailable();
    }

    let lastError: Error | null = null;

    // Try each provider in order
    for (const provider of this.providers) {
      try {
        const result = await provider.categorize(request);

        // If confidence is too low, try the next provider
        if (
          result.confidence < 50 &&
          this.providers.indexOf(provider) < this.providers.length - 1
        ) {
          console.log(
            `Low confidence (${result.confidence}%) from ${provider.name}, trying next provider`,
          );
          continue;
        }

        return result;
      } catch (error) {
        console.error(`Provider ${provider.name} failed:`, error);
        lastError = error as Error;
        // Continue to next provider
      }
    }

    // All providers failed
    throw new Error(
      `All providers failed. Last error: ${lastError?.message || "Unknown error"}`,
    );
  }
}

/**
 * Get a categorization provider with automatic fallback
 */
export async function getProviderWithFallback(): Promise<AIProvider> {
  const provider = new ProviderWithFallback();
  await provider.isAvailable();
  return provider;
}
