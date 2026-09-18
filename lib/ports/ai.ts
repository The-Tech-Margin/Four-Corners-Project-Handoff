/**
 * AI port: transcription and embeddings.
 *
 * `capabilities` is what the UI reads — when a capability is false the app
 * hides the affordance instead of offering a button that fails.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export interface AICapabilities {
  transcription: boolean;
  embeddings: boolean;
}

export interface TranscriptionInput {
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}

export interface TranscriptionResult {
  text: string;
  kind: "speech" | "empty";
}

export interface AIPort {
  readonly capabilities: AICapabilities;
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
  embed(text: string): Promise<{ vector: number[]; dimensions: number }>;
}
