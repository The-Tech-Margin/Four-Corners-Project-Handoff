/**
 * AI stub.
 *
 * A production adapter needs speech-to-text for voice notes and, if you want
 * semantic search, an embedding model. Report each through `capabilities`:
 * the UI hides a feature rather than offering one that fails. The original
 * deployment used Whisper for transcription and 1536-dimension OpenAI
 * embeddings; any provider with those two operations fits.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { AIPort } from "@/lib/ports/ai";
import { NotConfiguredError } from "@/lib/ports/errors";

const fail = (): never => {
  throw new NotConfiguredError(
    "AIPort",
    "FC_AI_ADAPTER",
    "Implement lib/ports/ai.ts against your speech-to-text and embedding provider.",
  );
};

export function createStubAI(): AIPort {
  return {
    capabilities: { transcription: true, embeddings: true },
    transcribe: fail,
    embed: fail,
  };
}
