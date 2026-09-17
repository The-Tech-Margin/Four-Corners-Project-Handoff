/**
 * Blob storage port: bytes in, bytes out, addressed by key.
 *
 * Buckets are a visibility class, not a vendor concept. Public buckets are
 * served to anyone who knows the key; private buckets are only served after
 * lib/server/blob-access.ts grants a request. URLs are the app's own routes,
 * so no adapter builds a vendor URL.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export type BucketName = "context-media" | "voice-recordings" | "consent-documents";

export const BUCKETS: Record<BucketName, { visibility: "public" | "private" }> = {
  "context-media": { visibility: "public" },
  "voice-recordings": { visibility: "private" },
  "consent-documents": { visibility: "private" },
};

export function isBucketName(value: string): value is BucketName {
  return Object.prototype.hasOwnProperty.call(BUCKETS, value);
}

export interface ByteRange {
  start: number;
  end?: number;
}

export interface BlobObject {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  /** Bytes in this response (a range is shorter than the object). */
  size: number;
  totalSize: number;
  etag: string;
  lastModified: string;
}

export interface BlobStat {
  size: number;
  contentType: string;
  etag: string;
}

export interface BlobStoragePort {
  put(
    bucket: BucketName,
    key: string,
    body: Uint8Array,
    meta: { contentType: string },
  ): Promise<{ size: number; etag: string }>;
  get(bucket: BucketName, key: string, range?: ByteRange): Promise<BlobObject | null>;
  head(bucket: BucketName, key: string): Promise<BlobStat | null>;
  copy(bucket: BucketName, fromKey: string, toKey: string): Promise<void>;
  delete(bucket: BucketName, keys: string[]): Promise<void>;
  /** Total bytes stored under one owner prefix. */
  usageForOwner(ownerId: string): Promise<{ bytes: number; objects: number }>;
}
