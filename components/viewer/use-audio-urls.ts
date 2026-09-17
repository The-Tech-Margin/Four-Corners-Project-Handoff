import { useState, useEffect, useRef } from "react";
import type { VoiceTranscription } from "@/lib/field-registry";
import {
  getVoiceRecordingSignedUrl,
  downloadVoiceRecording,
} from "@/lib/supabase-voice-storage";

/**
 * Fetches audio URLs for voice transcriptions that have a storage path
 * but no pre-signed URL. De-duplicates via a ref to avoid re-fetching.
 *
 * Returns a map of transcription ID → resolved audio URL.
 */
export function useAudioUrls(
  transcriptions: VoiceTranscription[],
  enabled: boolean = true,
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    for (const t of transcriptions) {
      const storagePath = t.audioStoragePath;
      if (
        storagePath &&
        !t.audioStorageUrl &&
        !t.audioDataUrl &&
        !fetchedRef.current.has(t.id)
      ) {
        fetchedRef.current.add(t.id);
        const tid = t.id;

        getVoiceRecordingSignedUrl(storagePath).then((url) => {
          if (cancelled) return;
          if (url) {
            setUrls((prev) => ({ ...prev, [tid]: url }));
          } else {
            return downloadVoiceRecording(storagePath).then((dataUrl) => {
              if (!cancelled && dataUrl) {
                setUrls((prev) => ({ ...prev, [tid]: dataUrl }));
              }
            });
          }
        });
      }
    }

    return () => {
      cancelled = true;
    };
  });

  return urls;
}
