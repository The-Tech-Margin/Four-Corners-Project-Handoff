/**
 * Supabase Storage utilities for voice recordings
 */

import { createClient } from "@/lib/supabase/client";
import type { VoiceTranscription } from "./field-registry";
import { recordAsset } from "@/lib/db/user-assets";
import { mediaStorage } from "@/lib/media-storage";

/**
 * Convert base64 data URL to Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "audio/webm";
  const base64Data = parts[1];
  const byteString = atob(base64Data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeType });
}

/**
 * Get file extension from mime type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm",
    "audio/webm;codecs=opus": "webm",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/ogg;codecs=opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
  };
  return mimeToExt[mimeType] || "webm";
}

/**
 * Upload a single voice recording to Supabase Storage
 */
export async function uploadVoiceRecordingToSupabase(
  transcription: VoiceTranscription,
  userId: string,
  projectId: string,
): Promise<{
  success: boolean;
  storagePath?: string;
  storageUrl?: string;
  error?: string;
}> {
  const supabase = createClient();

  if (!supabase) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    // Resolve the audio Blob. Preference order:
    //   1. transcription.audioDataUrl — happy path, audio is in memory
    //   2. mediaStorage.get(audioBlobId) — crash-recovery path; the page
    //      reloaded after the user recorded but before the upload finished
    //      (mobile tab-discard, refresh, etc.) and the data URL is gone but
    //      the Blob survived in IDB.
    let audioBlob: Blob | null = null;
    if (transcription.audioDataUrl) {
      audioBlob = dataUrlToBlob(transcription.audioDataUrl);
    } else if (typeof transcription.audioBlobId === "number") {
      const stored = await mediaStorage.get(transcription.audioBlobId);
      audioBlob = stored?.blob ?? null;
    }

    if (!audioBlob) {
      return { success: false, error: "No audio data to upload" };
    }

    const mimeType =
      transcription.mimeType || audioBlob.type || "audio/webm";
    const extension = getExtensionFromMimeType(mimeType);

    // Create storage path: userId/voice-recordings/projectId/recordingId.ext
    const storagePath = `${userId}/voice-recordings/${projectId}/${transcription.recordingId}.${extension}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("voice-recordings")
      .upload(storagePath, audioBlob, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Voice recording upload error:", uploadError);
      return { success: false, error: uploadError.message };
    }

    // Get signed URL (voice-recordings bucket is private)
    // Signed URL expiry
    const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("voice-recordings")
        .createSignedUrl(storagePath, TEN_YEARS_IN_SECONDS);

    if (signedUrlError) {
      console.error("Signed URL error:", signedUrlError);
      // Still record in library with empty storage_url; UI re-signs on demand.
      void recordAsset({
        mediaType: "audio",
        mimeType,
        fileName: `${transcription.recordingId}.${extension}`,
        storageBucket: "voice-recordings",
        storagePath,
        storageUrl: "",
        fileSize: audioBlob.size,
        duration: transcription.duration ?? null,
      });
      return {
        success: true,
        storagePath,
        storageUrl: undefined,
      };
    }

    void recordAsset({
      mediaType: "audio",
      mimeType,
      fileName: `${transcription.recordingId}.${extension}`,
      storageBucket: "voice-recordings",
      storagePath,
      storageUrl: signedUrlData.signedUrl,
      fileSize: audioBlob.size,
      duration: transcription.duration ?? null,
    });

    return {
      success: true,
      storagePath,
      storageUrl: signedUrlData.signedUrl,
    };
  } catch (error) {
    console.error("Voice recording upload failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Upload multiple voice recordings and clean up IndexedDB after successful upload
 */
export async function uploadVoiceRecordings(
  transcriptions: VoiceTranscription[],
  userId: string,
  projectId: string,
): Promise<
  Map<
    string,
    {
      success: boolean;
      storagePath?: string;
      storageUrl?: string;
      error?: string;
      recordingId?: string;
    }
  >
> {
  const results = new Map();

  for (const transcription of transcriptions) {
    const hasLocalAudio =
      !!transcription.audioDataUrl ||
      typeof transcription.audioBlobId === "number";
    if (hasLocalAudio && !transcription.audioStorageUrl) {
      const result = await uploadVoiceRecordingToSupabase(
        transcription,
        userId,
        projectId,
      );
      // On success, free the IDB blob — the audio is now in Supabase.
      if (
        result.success &&
        typeof transcription.audioBlobId === "number"
      ) {
        try {
          await mediaStorage.delete(transcription.audioBlobId);
        } catch (e) {
          // Non-fatal: blob will be garbage-collected by mediaStorage.cleanup
          // on the next sweep, or just sit until the user clears site data.
          console.warn(
            "[VoiceStorage] mediaStorage.delete failed:",
            e,
          );
        }
      }
      // Include recordingId for IndexedDB cleanup
      results.set(transcription.id, {
        ...result,
        recordingId: transcription.recordingId,
      });
    }
  }

  return results;
}

/**
 * Get a fresh signed URL for a voice recording.
 * Tries client-side first, falls back to server API (service role) for public views.
 */
export async function getVoiceRecordingSignedUrl(
  storagePath: string,
): Promise<string | null> {
  if (!storagePath) return null;

  // Server API first — uses service role key, works for all viewers
  // (avoids 400 console errors from client-side RLS failures on private bucket)
  try {
    const res = await fetch("/api/storage/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "voice-recordings", path: storagePath }),
    });
    if (res.ok) {
      const { signedUrl } = await res.json();
      if (signedUrl) return signedUrl;
    }
  } catch {
    // Server API unavailable, try client-side
  }

  // Fallback: client-side (works when user owns the recording)
  const supabase = createClient();
  if (supabase) {
    try {
      const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;
      const { data, error } = await supabase.storage
        .from("voice-recordings")
        .createSignedUrl(storagePath, TEN_YEARS_IN_SECONDS);

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    } catch {
      // Both methods failed
    }
  }

  return null;
}

/**
 * Download voice recording and convert to data URL for playback
 */
export async function downloadVoiceRecording(
  storagePath: string,
): Promise<string | null> {
  const supabase = createClient();

  if (!supabase || !storagePath) {
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from("voice-recordings")
      .download(storagePath);

    if (error) {
      console.error("Failed to download voice recording:", error);
      return null;
    }

    // Convert blob to data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(data);
    });
  } catch (error) {
    console.error("Download voice recording failed:", error);
    return null;
  }
}

/**
 * Refresh signed URLs for all voice transcriptions that have storage paths
 * This is needed because signed URLs expire
 */
export async function refreshVoiceRecordingUrls(
  transcriptions: VoiceTranscription[],
): Promise<VoiceTranscription[]> {
  const refreshedTranscriptions = await Promise.all(
    transcriptions.map(async (transcription) => {
      if (!transcription.audioStoragePath) {
        return transcription;
      }

      const signedUrl = await getVoiceRecordingSignedUrl(transcription.audioStoragePath);
      if (signedUrl) {
        return { ...transcription, audioStorageUrl: signedUrl };
      }
      return transcription;
    }),
  );

  return refreshedTranscriptions;
}

/**
 * Delete voice recording from Supabase Storage
 */
export async function deleteVoiceRecordingFromSupabase(
  storagePath: string,
): Promise<boolean> {
  const supabase = createClient();

  if (!supabase) {
    return false;
  }

  try {
    const { error } = await supabase.storage
      .from("voice-recordings")
      .remove([storagePath]);

    if (error) {
      console.error("Voice recording delete error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Voice recording delete failed:", error);
    return false;
  }
}
