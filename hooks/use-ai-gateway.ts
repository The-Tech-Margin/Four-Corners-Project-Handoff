"use client";

import { useState, useCallback } from "react";
import { notify } from "@/lib/notify";
import { getAudioFormat } from "@/lib/audio-utils";

interface UseAIGatewayOptions {
  model?: string;
  maxTokens?: number;
}

interface GenerateTextOptions {
  prompt: string;
  systemPrompt?: string;
}

// Vercel serverless functions have a 4.5 MB request body limit.
// Files larger than this threshold are uploaded to Supabase Storage first
// and transcribed via a storage-path reference instead.
const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MB (leave headroom)

export function useAIGateway(options: UseAIGatewayOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateText = useCallback(
    async ({ prompt, systemPrompt }: GenerateTextOptions): Promise<string> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/ai/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            systemPrompt,
            model: options.model,
            maxTokens: options.maxTokens,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate text");
        }

        const data = await response.json();
        return data.text;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to generate text";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [options.model, options.maxTokens]
  );

  /**
   * Upload a large audio blob to Supabase Storage for server-side processing.
   * Returns the storage path (to be passed to the transcribe API).
   */
  const uploadToTempStorage = useCallback(
    async (blob: Blob, mimeType: string): Promise<string> => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      if (!supabase) throw new Error("Storage not available — please sign in");

      // RLS requires the first folder to be the user's UID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in to upload audio files.");

      const ext = mimeType.split("/")[1]?.split(";")[0] || "webm";
      const path = `${user.id}/temp-transcribe/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("voice-recordings")
        .upload(path, blob, { contentType: mimeType, upsert: false });

      if (error) throw new Error(`Upload failed: ${error.message}`);
      return path;
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
            // ── Large file: upload to Supabase Storage, send path ──
            // Show progress toast for large uploads
            loadingToastId = notify.loading(
              `Uploading ${sizeMB}MB audio file...`
            );

            const storagePath = await uploadToTempStorage(audioBlob, effectiveMime);

            // Update toast to transcribing phase
            notify.dismiss(loadingToastId);
            loadingToastId = notify.loading("Transcribing audio...");

            response = await fetch("/api/ai/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ storagePath, mimeType: effectiveMime }),
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

  const analyzeImage = useCallback(
    async (
      imageDataUrl: string,
      prompt?: string,
      context?: string
    ): Promise<string> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/ai/analyze-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageDataUrl,
            prompt,
            context,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to analyze image");
        }

        const data = await response.json();
        return data.description;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to analyze image";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    generateText,
    transcribeAudio,
    analyzeImage,
    isLoading,
    error,
  };
}
