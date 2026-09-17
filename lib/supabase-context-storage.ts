/**
 * Supabase Storage utilities for context/related images
 */

import { createClient } from "@/lib/supabase/client";
import { mediaStorage } from "./media-storage";
import { recordAsset } from "@/lib/db/user-assets";
import { extensionFromMime } from "@/lib/upload-limits";
import type { ContextItem } from "./field-registry";

/**
 * Convert base64 data URL to Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "audio/webm";
  const byteString = atob(parts[1]);
  const ia = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ia], { type: mimeType });
}

/**
 * Generate a thumbnail blob from an original blob.
 * Aspect ratio is preserved — proportional scale, never upscales.
 */
export async function generateThumbnailBlob(
  originalBlob: Blob,
  maxWidth: number = 400,
  maxHeight: number = 400
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (originalBlob.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;

      video.onloadedmetadata = () => {
        video.currentTime = 0.5;
      };

      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(
          maxWidth / video.videoWidth,
          maxHeight / video.videoHeight
        );

        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create thumbnail blob"));
            }
            URL.revokeObjectURL(video.src);
          },
          "image/jpeg",
          0.8
        );
      };

      video.onerror = () => {
        reject(new Error("Error loading video"));
      };

      video.src = URL.createObjectURL(originalBlob);
    } else {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);

        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create thumbnail blob"));
            }
            URL.revokeObjectURL(img.src);
          },
          "image/jpeg",
          0.8
        );
      };

      img.onerror = () => {
        reject(new Error("Error loading image"));
      };

      img.src = URL.createObjectURL(originalBlob);
    }
  });
}

/**
 * Upload context image to Supabase Storage (both full-size and thumbnail)
 */
export async function uploadContextImageToSupabase(
  blobId: number,
  filename: string,
  userId: string,
  projectId: string
): Promise<{
  success: boolean;
  path?: string;
  url?: string;
  thumbnail_path?: string;
  thumbnail_url?: string;
  error?: string;
}> {
  const supabase = createClient();

  if (!supabase) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const mediaBlob = await mediaStorage.get(blobId);
    if (!mediaBlob) {
      return { success: false, error: "Image not found in local storage" };
    }

    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const basePath = `${userId}/context-images/${projectId}`;
    const fullSizePath = `${basePath}/${sanitizedFilename}`;
    const thumbnailPath = `${basePath}/thumbs/${sanitizedFilename}`;

    // Upload full-size image
    const { error: fullSizeError } = await supabase.storage
      .from("context-media")
      .upload(fullSizePath, mediaBlob.blob, {
        contentType: mediaBlob.mimeType,
        upsert: true,
      });

    if (fullSizeError) {
      console.error("Full-size upload error:", fullSizeError);
      return { success: false, error: fullSizeError.message };
    }

    // Generate and upload thumbnail — best-effort. A failure here (e.g. a
    // browser that can't decode this video's codec) must not discard the
    // already-successful full-size upload.
    let thumbnailUploaded = false;
    try {
      const thumbnailBlob = await generateThumbnailBlob(mediaBlob.blob);
      const { error: thumbnailError } = await supabase.storage
        .from("context-media")
        .upload(thumbnailPath, thumbnailBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (thumbnailError) {
        console.error("Thumbnail upload error:", thumbnailError);
      } else {
        thumbnailUploaded = true;
      }
    } catch (thumbErr) {
      console.error("Thumbnail generation failed:", thumbErr);
    }

    // Get public URLs
    const { data: fullSizeData } = supabase.storage
      .from("context-media")
      .getPublicUrl(fullSizePath);

    const { data: thumbnailData } = supabase.storage
      .from("context-media")
      .getPublicUrl(thumbnailPath);

    // Index in the user's library (fire-and-forget — never blocks upload).
    const isVideo = mediaBlob.mimeType.startsWith("video/");
    void recordAsset({
      mediaType: isVideo ? "video" : "image",
      mimeType: mediaBlob.mimeType,
      fileName: filename,
      storageBucket: "context-media",
      storagePath: fullSizePath,
      storageUrl: fullSizeData.publicUrl,
      thumbnailStoragePath: thumbnailUploaded ? thumbnailPath : null,
      thumbnailStorageUrl: thumbnailUploaded ? thumbnailData.publicUrl : null,
      fileSize: mediaBlob.blob.size,
    });

    return {
      success: true,
      path: fullSizePath,
      url: fullSizeData.publicUrl,
      thumbnail_path: thumbnailUploaded ? thumbnailPath : undefined,
      thumbnail_url: thumbnailUploaded ? thumbnailData.publicUrl : undefined,
    };
  } catch (error) {
    console.error("Context image upload failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Upload multiple context images
 */
export async function uploadContextImages(
  contextItems: Array<{
    id: string;
    blobId?: number;
    filename?: string;
    sourceType: "upload" | "url";
  }>,
  userId: string,
  projectId: string
): Promise<
  Map<
    string,
    {
      success: boolean;
      path?: string;
      url?: string;
      thumbnail_path?: string;
      thumbnail_url?: string;
      error?: string;
    }
  >
> {
  const results = new Map();

  for (const item of contextItems) {
    if (item.sourceType === "upload" && item.blobId && item.filename) {
      const result = await uploadContextImageToSupabase(
        item.blobId,
        item.filename,
        userId,
        projectId
      );
      results.set(item.id, result);
    }
  }

  return results;
}

/**
 * Upload context-item audio annotations to Supabase Storage.
 *
 * Twin of uploadVoiceRecordings (lib/supabase-voice-storage.ts): items with
 * local audio (`audioDataUrl`, or `audioBlobId` on the crash-recovery path)
 * and no `audioStorageUrl` upload to the public `context-media` bucket; the
 * IDB blob is freed on success.
 */
export async function uploadContextAudio(
  contextItems: Array<
    Pick<
      ContextItem,
      "id" | "audioDataUrl" | "audioBlobId" | "audioStorageUrl" | "audioMimeType"
    >
  >,
  userId: string,
  projectId: string,
): Promise<
  Map<
    string,
    {
      success: boolean;
      audioStoragePath?: string;
      audioStorageUrl?: string;
      error?: string;
    }
  >
> {
  const results = new Map();

  const supabase = createClient();
  if (!supabase) {
    return results;
  }

  for (const item of contextItems) {
    const hasLocalAudio =
      !!item.audioDataUrl || typeof item.audioBlobId === "number";
    if (!hasLocalAudio || item.audioStorageUrl) continue;

    try {
      let audioBlob: Blob | null = null;
      if (item.audioDataUrl) {
        audioBlob = dataUrlToBlob(item.audioDataUrl);
      } else if (typeof item.audioBlobId === "number") {
        const stored = await mediaStorage.get(item.audioBlobId);
        audioBlob = stored?.blob ?? null;
      }

      if (!audioBlob) {
        results.set(item.id, {
          success: false,
          error: "No audio data to upload",
        });
        continue;
      }

      const mimeType = item.audioMimeType || audioBlob.type || "audio/webm";
      const extension = extensionFromMime(mimeType);
      const storagePath = `${userId}/context-audio/${projectId}/${item.id}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("context-media")
        .upload(storagePath, audioBlob, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.error("Context audio upload error:", uploadError);
        results.set(item.id, { success: false, error: uploadError.message });
        continue;
      }

      const { data } = supabase.storage
        .from("context-media")
        .getPublicUrl(storagePath);

      // Index in the user's library (fire-and-forget).
      void recordAsset({
        mediaType: "audio",
        mimeType,
        fileName: `${item.id}.${extension}`,
        storageBucket: "context-media",
        storagePath,
        storageUrl: data.publicUrl,
        fileSize: audioBlob.size,
      });

      // Free the IDB blob — Supabase is now the source of truth.
      if (typeof item.audioBlobId === "number") {
        try {
          await mediaStorage.delete(item.audioBlobId);
        } catch (e) {
          console.warn("[ContextStorage] mediaStorage.delete failed:", e);
        }
      }

      results.set(item.id, {
        success: true,
        audioStoragePath: storagePath,
        audioStorageUrl: data.publicUrl,
      });
    } catch (error) {
      console.error("Context audio upload failed:", error);
      results.set(item.id, {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  return results;
}

/**
 * Upload the main project image (or video) (base64 data URL) to Supabase
 * Storage. Returns the storage paths on success, null on failure. Failures
 * are logged with a specific reason so the developer can see *why* a save's
 * `collectUploadFailures` flagged the main media.
 *
 * Accepts `image/*` and `video/*` data URLs. Generates a ≤400px JPEG
 * thumbnail (canvas-painted first-frame for video) — thumb is best-effort
 * and never fails the main upload.
 */
export async function uploadMainImageToStorage(
  dataUrl: string,
  userId: string,
  projectId: string,
): Promise<{ path: string; url: string; thumbnailPath: string | null } | null> {
  // Already a URL, or empty — nothing to upload (not a failure).
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;

  const supabase = createClient();
  if (!supabase) {
    console.error("Main media upload skipped: Supabase client not configured");
    return null;
  }

  try {
    // Accept both image and video data URLs. The subtype allows hyphens and
    // `+` for mimes like `image/svg+xml`.
    const match = dataUrl.match(/^data:((image|video)\/([\w.+-]+));base64,(.+)$/);
    if (!match) {
      console.error(
        `Main media upload skipped: data URL is not image/* or video/* — got "${dataUrl.slice(0, 32)}..."`,
      );
      return null;
    }

    const mimeType = match[1];
    const ext = extensionFromMime(mimeType);
    const buffer = Uint8Array.from(atob(match[4]), (c) => c.charCodeAt(0));
    const storagePath = `${userId}/main-images/${projectId}.${ext}`;

    const { error } = await supabase.storage
      .from("context-media")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error(`Main media upload error (${mimeType}, ${buffer.byteLength}B):`, error);
      return null;
    }

    const { data } = supabase.storage
      .from("context-media")
      .getPublicUrl(storagePath);

    // Index in the user's library (fire-and-forget).
    void recordAsset({
      mediaType: mimeType.startsWith("video/") ? "video" : "image",
      mimeType,
      fileName: `${projectId}.${ext}`,
      storageBucket: "context-media",
      storagePath,
      storageUrl: data.publicUrl,
      fileSize: buffer.byteLength,
    });

    // Generate + upload the gallery thumbnail. Best-effort — any failure
    // here returns thumbnailPath: null, the main upload still succeeds.
    // Video thumbs come from the first decodable frame via canvas; codecs
    // the browser can't decode just skip.
    let thumbnailPath: string | null = null;
    try {
      const originalBlob = new Blob([buffer], { type: mimeType });
      const thumbBlob = await generateThumbnailBlob(originalBlob);
      const thumbPath = `${userId}/main-images/${projectId}.thumb.jpg`;
      const { error: thumbError } = await supabase.storage
        .from("context-media")
        .upload(thumbPath, thumbBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (!thumbError) thumbnailPath = thumbPath;
    } catch { /* best-effort — fall through with null */ }

    return { path: storagePath, url: data.publicUrl, thumbnailPath };
  } catch (error) {
    console.error("Main media upload failed:", error);
    return null;
  }
}

/**
 * Delete context image from Supabase Storage
 */
export async function deleteContextImageFromSupabase(
  storagePath: string
): Promise<boolean> {
  const supabase = createClient();

  if (!supabase) {
    return false;
  }

  try {
    const { error } = await supabase.storage
      .from("context-media")
      .remove([storagePath]);

    if (error) {
      console.error("Supabase context image delete error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Context image delete failed:", error);
    return false;
  }
}
