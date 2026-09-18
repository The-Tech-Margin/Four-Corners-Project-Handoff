/**
 * Every blob a project document points at. Used to check access to a
 * private blob through a published project, and to copy media on fork.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { BucketName } from "@/lib/ports/blob-storage";
import type { ProjectDocument } from "./types";

export interface BlobRef {
  bucket: BucketName;
  key: string;
}

/** Context media and main images are public; voice recordings are not. */
export function bucketForKey(key: string): BucketName {
  if (key.includes("/voice-recordings/") || key.includes("/temp-transcribe/")) {
    return "voice-recordings";
  }
  if (key.includes("/consent-documents/")) return "consent-documents";
  return "context-media";
}

export function collectBlobRefs(doc: ProjectDocument): BlobRef[] {
  const refs: BlobRef[] = [];
  const add = (key: string | null | undefined) => {
    if (!key) return;
    refs.push({ bucket: bucketForKey(key), key });
  };

  if (doc.mainImage?.kind === "blob") {
    add(doc.mainImage.key);
    add(doc.mainImage.thumbnailKey);
  }

  for (const item of doc.metadata.context ?? []) {
    add(item.storage_path);
    add(item.thumbnail_storage_path);
    add(item.audioStoragePath);
  }

  for (const voice of doc.metadata.voiceTranscriptions ?? []) {
    add(voice.audioStoragePath);
  }

  const seen = new Set<string>();
  return refs.filter((ref) => {
    const id = `${ref.bucket}:${ref.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function referencesKey(doc: ProjectDocument, bucket: BucketName, key: string): boolean {
  return collectBlobRefs(doc).some((ref) => ref.bucket === bucket && ref.key === key);
}
