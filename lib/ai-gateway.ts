/**
 * AI Gateway Configuration
 * OpenAI API integration for image analysis and text generation
 *
 * @author TheTechMargin
 */

export const AI_GATEWAY_CONFIG = {
  // Default model for text generation
  defaultModel: "gpt-4o-mini",

  // Default model for transcription
  transcriptionModel: "whisper-1",

  // Default model for embeddings (gateway requires provider prefix)
  embeddingModel: "openai/text-embedding-3-small",

  // API endpoint base
  baseUrl: "https://api.vercel.com/v1/ai",

  // Token limits
  maxTokens: {
    default: 1000,
    transcription: 500,
  },

  // Embedding config
  embeddingDimensions: 1536,
  maxEmbeddingChars: 32000, // ~8000 tokens
};

/**
 * Get AI Gateway API key from environment
 */
export function getAIGatewayKey(): string {
  const key = process.env.AI_GATEWAY_KEY;
  if (!key) {
    throw new Error(
      "AI_GATEWAY_KEY environment variable is not set. Create an API key at: https://vercel.com/[team]/~/ai"
    );
  }
  return key;
}

/**
 * Create headers for AI Gateway requests
 */
export function createAIGatewayHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getAIGatewayKey()}`,
    "Content-Type": "application/json",
  };
}
