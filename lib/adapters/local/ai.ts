/**
 * Local AI: unavailable. Transcription and embeddings need a provider, so
 * the app hides those affordances rather than offering a button that fails.
 * See docs/INTEGRATION.md to wire a real one.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { AIPort } from "@/lib/ports/ai";
import { CapabilityUnavailableError } from "@/lib/ports/errors";

export function createLocalAI(): AIPort {
  return {
    capabilities: { transcription: false, embeddings: false },
    async transcribe() {
      throw new CapabilityUnavailableError("Transcription");
    },
    async embed() {
      throw new CapabilityUnavailableError("Embeddings");
    },
  };
}
