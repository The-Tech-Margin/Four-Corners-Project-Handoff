/**
 * Look up text already transcribed for a recording.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { apiGet } from "./http";

export async function findTranscriptByAudioKey(audioKey: string): Promise<string | null> {
  try {
    const { text } = await apiGet<{ text: string | null }>(
      `/api/transcripts?audioKey=${encodeURIComponent(audioKey)}`,
    );
    return text;
  } catch {
    return null;
  }
}
