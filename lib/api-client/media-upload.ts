/**
 * Media uploads from the editor.
 *
 * Successor to the storage helpers that talked to the object store from the
 * browser: pending media is posted to /api/storage/upload, which checks the
 * session and the quota and decides the key. Local blobs (IndexedDB, data
 * URLs) are freed once the bytes are safely stored.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

"use client";

import type { ContextItem, VoiceTranscription } from "@/lib/field-registry";
import { generateThumbnailBlob } from "@/lib/media/generate-thumbnail";
import { mediaStorage } from "@/lib/media-storage";
import { extensionFromMime } from "@/lib/upload-limits";
import { upload, type UploadResult } from "./storage";

export interface ContextUploadResult {
  success: boolean;
  path?: string;
  url?: string;
  thumbnail_path?: string;
  thumbnail_url?: string;
  error?: string;
}

export interface AudioUploadResult {
  success: boolean;
  audioStoragePath?: string;
  audioStorageUrl?: string;
  error?: string;
}

export interface VoiceUploadResult {
  success: boolean;
  storagePath?: string;
  storageUrl?: string;
  recordingId?: string;
  error?: string;
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) return null;

  const mimeType = match[1] || "application/octet-stream";
  try {
    if (!match[2]) return new Blob([decodeURIComponent(match[3])], { type: mimeType });
    const binary = atob(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : "Upload failed";

/** Context images and videos that still live in IndexedDB. */
export async function uploadContextImages(
  items: Pick<ContextItem, "id" | "blobId" | "filename" | "sourceType">[],
  projectId: string,
): Promise<Map<string, ContextUploadResult>> {
  const results = new Map<string, ContextUploadResult>();

  for (const item of items) {
    if (item.sourceType !== "upload" || typeof item.blobId !== "number" || !item.filename) {
      continue;
    }

    try {
      const stored = await mediaStorage.get(item.blobId);
      if (!stored) {
        results.set(item.id, { success: false, error: "The file is no longer on this device" });
        continue;
      }

      const media: UploadResult = await upload({
        purpose: "context-media",
        blob: stored.blob,
        fileName: item.filename,
        projectId,
      });

      const result: ContextUploadResult = {
        success: true,
        path: media.key,
        url: media.url,
      };

      // A missing thumbnail costs a little bandwidth, not the upload.
      try {
        const thumbnail = await generateThumbnailBlob(stored.blob);
        const thumb = await upload({
          purpose: "context-thumbnail",
          blob: thumbnail,
          fileName: item.filename,
          projectId,
        });
        result.thumbnail_path = thumb.key;
        result.thumbnail_url = thumb.url;
      } catch {
        /* keep the full-size image */
      }

      await mediaStorage.delete(item.blobId).catch(() => undefined);
      results.set(item.id, result);
    } catch (error) {
      results.set(item.id, { success: false, error: message(error) });
    }
  }

  return results;
}

/** One audio annotation per context item. */
export async function uploadContextAudio(
  items: Pick<
    ContextItem,
    "id" | "audioDataUrl" | "audioBlobId" | "audioStorageUrl" | "audioMimeType"
  >[],
  projectId: string,
): Promise<Map<string, AudioUploadResult>> {
  const results = new Map<string, AudioUploadResult>();

  for (const item of items) {
    const hasLocalAudio = !!item.audioDataUrl || typeof item.audioBlobId === "number";
    if (!hasLocalAudio || item.audioStorageUrl) continue;

    try {
      const blob =
        typeof item.audioBlobId === "number"
          ? (await mediaStorage.get(item.audioBlobId))?.blob
          : item.audioDataUrl
            ? dataUrlToBlob(item.audioDataUrl)
            : null;

      if (!blob) {
        results.set(item.id, { success: false, error: "The audio is no longer on this device" });
        continue;
      }

      const mimeType = item.audioMimeType || blob.type || "audio/webm";
      const stored = await upload({
        purpose: "context-audio",
        blob,
        fileName: `${item.id}.${extensionFromMime(mimeType)}`,
        projectId,
        itemId: item.id,
      });

      if (typeof item.audioBlobId === "number") {
        await mediaStorage.delete(item.audioBlobId).catch(() => undefined);
      }
      results.set(item.id, {
        success: true,
        audioStoragePath: stored.key,
        audioStorageUrl: stored.url,
      });
    } catch (error) {
      results.set(item.id, { success: false, error: message(error) });
    }
  }

  return results;
}

/** The project's primary image, uploaded from its data URL. */
export async function uploadMainImage(
  dataUrl: string,
  projectId: string,
): Promise<{ path: string; url: string; thumbnailPath: string | null } | null> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;

  const blob = dataUrlToBlob(dataUrl);
  if (!blob || !/^(image|video)\//.test(blob.type)) return null;

  try {
    const extension = extensionFromMime(blob.type);
    const stored = await upload({
      purpose: "main-image",
      blob,
      fileName: `${projectId}.${extension}`,
      projectId,
    });

    let thumbnailPath: string | null = null;
    try {
      const thumbnail = await generateThumbnailBlob(blob);
      const thumb = await upload({
        purpose: "main-thumbnail",
        blob: thumbnail,
        fileName: `${projectId}.thumb.jpg`,
        projectId,
      });
      thumbnailPath = thumb.key;
    } catch {
      /* best effort */
    }

    return { path: stored.key, url: stored.url, thumbnailPath };
  } catch (error) {
    console.error("Main image upload failed:", message(error));
    return null;
  }
}

export async function uploadVoiceRecording(
  transcription: VoiceTranscription,
  projectId: string,
): Promise<VoiceUploadResult> {
  try {
    const blob =
      typeof transcription.audioBlobId === "number"
        ? (await mediaStorage.get(transcription.audioBlobId))?.blob
        : transcription.audioDataUrl
          ? dataUrlToBlob(transcription.audioDataUrl)
          : null;

    if (!blob) return { success: false, error: "The recording is no longer on this device" };

    const mimeType = transcription.mimeType || blob.type || "audio/webm";
    const stored = await upload({
      purpose: "voice-recording",
      blob,
      fileName: `${transcription.recordingId}.${extensionFromMime(mimeType)}`,
      projectId,
      itemId: transcription.recordingId,
    });

    if (typeof transcription.audioBlobId === "number") {
      await mediaStorage.delete(transcription.audioBlobId).catch(() => undefined);
    }

    return {
      success: true,
      storagePath: stored.key,
      storageUrl: stored.url,
      recordingId: transcription.recordingId,
    };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function uploadVoiceRecordings(
  transcriptions: VoiceTranscription[],
  projectId: string,
): Promise<Map<string, VoiceUploadResult>> {
  const results = new Map<string, VoiceUploadResult>();

  for (const transcription of transcriptions) {
    const hasLocalAudio =
      !!transcription.audioDataUrl || typeof transcription.audioBlobId === "number";
    if (!hasLocalAudio || transcription.audioStorageUrl) continue;

    results.set(transcription.id, await uploadVoiceRecording(transcription, projectId));
  }

  return results;
}
