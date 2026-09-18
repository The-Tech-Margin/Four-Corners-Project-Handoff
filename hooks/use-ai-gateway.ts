"use client";

import { useState, useCallback } from "react";
import { notify } from "@/lib/notify";
import { getAudioFormat } from "@/lib/audio-utils";
import { upload } from "@/lib/api-client/storage";

// Recordings above this size are staged in storage and transcribed by key,
// so a large upload never has to fit in one request body.
const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MB

export function useAIGateway() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Stage a large recording so the server can read it, and return the key
   * the transcription route accepts. The route deletes it afterwards.
   */
  const uploadToTempStorage = useCallback(
    async (blob: Blob, mimeType: string): Promise<string> => {
      const { extension } = getAudioFormat(mimeType);
      const result = await upload({
        purpose: "transcribe-source",
        blob,
        fileName: `audio.${extension}`,
        itemId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      return result.key;
    },
    []
  );

  const transcribeAudio = useCallback(
    async (
      audioDataUrl: string,
      mimeType?: string,
      maxRetries: number = 3
    ): Promise<string> => {
      setIsLoading(true);
      setError(null);

      let lastError: Error | null = null;
      let loadingToastId: string | undefined;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          // 5 minutes — large audio files need time to upload and transcribe
          const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

          // Convert data URL to Blob
          const res = await fetch(audioDataUrl);
          const audioBlob = await res.blob();
          const effectiveMime = mimeType || audioBlob.type || "audio/webm";
          const sizeMB = (audioBlob.size / (1024 * 1024)).toFixed(1);

          let response: Response;

          if (audioBlob.size <= DIRECT_UPLOAD_LIMIT) {
            // ── Small file: send directly via FormData ──
            const formData = new FormData();
            const { extension } = getAudioFormat(effectiveMime);
            formData.append("file", audioBlob, `audio.${extension}`);
            formData.append("mimeType", effectiveMime);

            response = await fetch("/api/ai/transcribe", {
              method: "POST",
              body: formData,
              signal: controller.signal,
            });
          } else {
            // ── Large file: upload to storage, send path ──
            // Show progress toast for large uploads
            loadingToastId = notify.loading(
              `Uploading ${sizeMB}MB audio file...`
            );

            const key = await uploadToTempStorage(audioBlob, effectiveMime);

            // Update toast to transcribing phase
            notify.dismiss(loadingToastId);
            loadingToastId = notify.loading("Transcribing audio...");

            response = await fetch("/api/ai/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key, mimeType: effectiveMime }),
              signal: controller.signal,
            });
          }

          clearTimeout(timeoutId);

          if (!response.ok) {
            // Parse error safely — Vercel 413/502 returns HTML, not JSON
            let errorMessage = "Failed to transcribe audio";
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
            } catch {
              if (response.status === 413) {
                errorMessage =
                  "Audio file is too large to process. Try a shorter recording.";
              } else if (response.status === 401) {
                errorMessage =
                  "Not authorized. Please sign in and try again.";
              } else {
                errorMessage = `Transcription failed (${response.status})`;
              }
            }
            throw new Error(errorMessage);
          }

          const data = await response.json();

          // Dismiss loading toast
          if (loadingToastId) notify.dismiss(loadingToastId);

          // Surface result type to user
          if (data.type === "soundscape") {
            notify.info("No speech detected — described as a soundscape.");
          } else if (data.type === "empty") {
            notify.info("No speech or sounds detected in the recording.");
          }

          setIsLoading(false);
          return data.text;
        } catch (err) {
          lastError =
            err instanceof Error
              ? err
              : new Error("Failed to transcribe audio");

          // Don't retry on certain errors
          if (
            lastError.message.includes("Invalid API key") ||
            lastError.message.includes("Invalid audio format") ||
            lastError.message.includes("too large") ||
            lastError.message.includes("Not authorized") ||
            lastError.message.includes("Storage not available")
          ) {
            break;
          }

          // Exponential backoff: wait 1s, 2s, 4s between retries
          if (attempt < maxRetries - 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * Math.pow(2, attempt))
            );
          }
        }
      }

      // Dismiss loading toast on failure
      if (loadingToastId) notify.dismiss(loadingToastId);

      const errorMessage = lastError?.message || "Failed to transcribe audio";
      setError(errorMessage);
      setIsLoading(false);
      throw lastError || new Error(errorMessage);
    },
    [uploadToTempStorage]
  );

  return {
    transcribeAudio,
    isLoading,
    error,
  };
}
