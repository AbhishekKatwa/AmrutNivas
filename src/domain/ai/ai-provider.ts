/**
 * AI provider abstraction.
 *
 * Decouples business logic from specific AI model providers.
 * Future implementations can plug in OpenAI, Anthropic, local models, etc.
 */

import type { AIContext } from "./types";

// =====================================================================
// PROVIDER INTERFACE
// =====================================================================

export interface AIProviderConfig {
  name: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIProvider {
  /**
   * Generate a natural language response.
   */
  generateResponse(
    prompt: string,
    context: AIContext,
    config?: AIProviderConfig,
  ): Promise<string>;

  /**
   * Generate a structured response (JSON).
   */
  generateStructuredResponse<T>(
    prompt: string,
    context: AIContext,
    config?: AIProviderConfig,
  ): Promise<T>;

  /**
   * Check if the provider is available.
   */
  isAvailable(): Promise<boolean>;
}

// =====================================================================
// STUB PROVIDER
// =====================================================================

/**
 * Stub provider that returns deterministic responses.
 * Used when no real AI provider is configured.
 */
class StubAIProvider implements AIProvider {
  async generateResponse(
    prompt: string,
    _context: AIContext,
    _config?: AIProviderConfig,
  ): Promise<string> {
    return generateStubResponse(prompt);
  }

  async generateStructuredResponse<T>(
    prompt: string,
    _context: AIContext,
    _config?: AIProviderConfig,
  ): Promise<T> {
    return generateStubStructuredResponse<T>(prompt);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// =====================================================================
// STUB RESPONSE GENERATION
// =====================================================================

function generateStubResponse(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("revenue") && lower.includes("fall")) {
    return `Revenue decreased based on the available data. Review the analytics dashboard for detailed breakdowns by source and period.`;
  }

  if (lower.includes("attention") || lower.includes("needs")) {
    return `Check the Owner Command Center for current attention items including low stock, overdue receivables, and operational alerts.`;
  }

  if (lower.includes("summary") || lower.includes("today")) {
    return `Today's business summary is available in the Owner Command Center with revenue, occupancy, and operational metrics.`;
  }

  return `AMRUT AI is running in stub mode. Configure an AI provider to enable intelligent analysis and recommendations.`;
}

function generateStubStructuredResponse<T>(prompt: string): T {
  const lower = prompt.toLowerCase();

  if (lower.includes("revenue")) {
    return {
      answer: "Revenue data available in analytics.",
      findings: [],
      recommendations: [],
      sources: [],
    } as T;
  }

  return {
    answer: "AMRUT AI stub mode. Configure a provider for intelligent responses.",
    findings: [],
    recommendations: [],
    sources: [],
  } as T;
}

// =====================================================================
// PROVIDER REGISTRY
// =====================================================================

let currentProvider: AIProvider = new StubAIProvider();

/**
 * Set the active AI provider.
 */
export function setAIProvider(provider: AIProvider): void {
  currentProvider = provider;
}

/**
 * Get the active AI provider.
 */
export function getAIProvider(): AIProvider {
  return currentProvider;
}

/**
 * Check if a real (non-stub) AI provider is configured.
 */
export function isAIProviderConfigured(): boolean {
  return !(currentProvider instanceof StubAIProvider);
}

/**
 * Check if AI is available.
 */
export async function isAIAvailable(): Promise<boolean> {
  try {
    return await currentProvider.isAvailable();
  } catch {
    return false;
  }
}
