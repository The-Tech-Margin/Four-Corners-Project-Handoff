/**
 * Write-side normalisation. Browser-only fields never reach storage, blob
 * keys are checked against the owner, and derived URLs are dropped so a
 * read always rebuilds them from the key (see projections.ts).
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { FourCornersMetadataExtended } from "@/lib/schema";
import type { ContextItem, VoiceTranscription } from "@/lib/field-registry";
import { isOwnedBy, isValidBlobKey } from "@/lib/storage/keys";
import { bucketForKey } from "./blob-refs";
import type { MainImageRef, UserId } from "./types";

export interface NormalizeInput {
  metadata: FourCornersMetadataExtended;
  mainImage?: MainImageRef;
  ownerId: UserId;
}

export interface NormalizeResult {
  metadata: FourCornersMetadataExtended;
  mainImage: MainImageRef;
  warnings: string[];
}

const isDataUrl = (value: string | undefined): boolean => !!value?.startsWith("data:");

/**
 * Keys must belong to the owner. A foreign private key is dropped outright;
 * a foreign public key keeps working as a plain URL but stops being treated
 * as this owner's blob.
 */
function acceptKey(
  key: string | undefined,
  ownerId: UserId,
  field: string,
  warnings: string[],
): string | undefined {
  if (!key) return undefined;
  if (!isValidBlobKey(key)) {
    warnings.push(`Dropped malformed storage key on ${field}.`);
    return undefined;
  }
  if (!isOwnedBy(key, ownerId)) {
    warnings.push(`Dropped storage key on ${field}: it belongs to another account.`);
    return undefined;
  }
  return key;
}

function normalizeContextItem(
  item: ContextItem,
  ownerId: UserId,
  warnings: string[],
): ContextItem {
  const next: ContextItem = { ...item };

  // Browser-only carriers for pending uploads.
  delete next.blobId;
  delete next.audioBlobId;
  delete next.thumbnailDataUrl;
  delete next.audioDataUrl;

  next.storage_path = acceptKey(next.storage_path, ownerId, "context item", warnings);
  next.thumbnail_storage_path = acceptKey(
    next.thumbnail_storage_path,
    ownerId,
    "context thumbnail",
    warnings,
  );
  next.audioStoragePath = acceptKey(
    next.audioStoragePath,
    ownerId,
    "context audio",
    warnings,
  );

  // Derived URLs are rebuilt on read; a data URL is never persisted.
  if (next.storage_path || isDataUrl(next.storage_url)) delete next.storage_url;
  if (next.thumbnail_storage_path || isDataUrl(next.thumbnail_storage_url)) {
    delete next.thumbnail_storage_url;
  }
  if (next.audioStoragePath || isDataUrl(next.audioStorageUrl)) delete next.audioStorageUrl;
  if (next.storage_path || isDataUrl(next.src)) delete next.src;
  if (isDataUrl(next.url)) delete next.url;

  return next;
}

function normalizeVoice(
  voice: VoiceTranscription,
  ownerId: UserId,
  warnings: string[],
): VoiceTranscription {
  const next: VoiceTranscription = { ...voice };
  delete next.audioBlobId;
  delete next.audioDataUrl;

  next.audioStoragePath = acceptKey(
    next.audioStoragePath,
    ownerId,
    "voice recording",
    warnings,
  );
  if (next.audioStoragePath || isDataUrl(next.audioStorageUrl)) delete next.audioStorageUrl;
  return next;
}

function normalizeMainImage(
  mainImage: MainImageRef | undefined,
  ownerId: UserId,
  warnings: string[],
): MainImageRef {
  if (!mainImage) return null;

  if (mainImage.kind === "url") {
    if (isDataUrl(mainImage.url)) {
      warnings.push("Dropped the main image: inline image data is not stored.");
      return null;
    }
    return mainImage;
  }

  const key = acceptKey(mainImage.key, ownerId, "main image", warnings);
  if (!key) return null;
  if (bucketForKey(key) !== "context-media") {
    warnings.push("Dropped the main image: unexpected storage bucket.");
    return null;
  }
  const thumbnailKey =
    acceptKey(mainImage.thumbnailKey ?? undefined, ownerId, "main thumbnail", warnings) ??
    null;
  return { kind: "blob", key, thumbnailKey };
}

export function normalizeForPersistence(input: NormalizeInput): NormalizeResult {
  const warnings: string[] = [];
  const { metadata, ownerId } = input;

  const normalized: FourCornersMetadataExtended = {
    ...metadata,
    context: (metadata.context ?? []).map((item) =>
      normalizeContextItem(item, ownerId, warnings),
    ),
    voiceTranscriptions: metadata.voiceTranscriptions
      ? metadata.voiceTranscriptions.map((voice) => normalizeVoice(voice, ownerId, warnings))
      : metadata.voiceTranscriptions,
  };

  return {
    metadata: normalized,
    mainImage: normalizeMainImage(input.mainImage, ownerId, warnings),
    warnings,
  };
}
