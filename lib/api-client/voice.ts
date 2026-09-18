/**
 * Playback URLs for voice recordings.
 *
 * A recording lives in a private bucket. Its owner gets a signed link; a
 * public viewer gets one scoped to the published project, which stops
 * working the moment that project is unpublished.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

"use client";

import type { VoiceTranscription } from "@/lib/field-registry";
import { blobUrl } from "@/lib/storage/blob-url";
import { signUrl } from "./storage";

export async function getVoiceRecordingUrl(
  key: string,
  options: { projectId?: string } = {},
): Promise<string | null> {
  if (!key) return null;

  if (options.projectId) {
    return blobUrl("voice-recordings", key, { projectId: options.projectId });
  }

  try {
    const { signedUrl } = await signUrl("voice-recordings", key);
    return signedUrl;
  } catch {
    return null;
  }
}

export async function downloadVoiceRecording(
  key: string,
  options: { projectId?: string } = {},
): Promise<Blob | null> {
  const url = await getVoiceRecordingUrl(key, options);
  if (!url) return null;

  try {
    const response = await fetch(url, { credentials: "same-origin" });
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

/** Refresh the playback URLs on a set of transcriptions. */
export async function refreshVoiceRecordingUrls(
  transcriptions: VoiceTranscription[],
  options: { projectId?: string } = {},
): Promise<VoiceTranscription[]> {
  return Promise.all(
    transcriptions.map(async (transcription) => {
      if (!transcription.audioStoragePath) return transcription;
      const url = await getVoiceRecordingUrl(transcription.audioStoragePath, options);
      return url ? { ...transcription, audioStorageUrl: url } : transcription;
    }),
  );
}
