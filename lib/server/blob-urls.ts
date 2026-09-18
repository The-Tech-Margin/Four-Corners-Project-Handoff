/**
 * Signed blob links: `?exp=<epoch>&sig=<hmac>` on an /api/blobs URL.
 *
 * Signatures are minted only for a blob's owner (the export engine asks for
 * them), and they expire. Public viewers reach a private object a different
 * way — through the project that publishes it, see blob-access.ts.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config/server-config";
import type { BucketName } from "@/lib/ports/blob-storage";
import { blobUrl } from "@/lib/storage/blob-url";

function signature(bucket: BucketName, key: string, expiresAt: number): string {
  return createHmac("sha256", getConfig().sessionSecret)
    .update(`blob:${bucket}:${key}:${expiresAt}`)
    .digest("base64url");
}

export function signBlobUrl(
  bucket: BucketName,
  key: string,
  ttlSeconds = getConfig().privateUrlTtlSeconds,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const params = new URLSearchParams({
    exp: String(expiresAt),
    sig: signature(bucket, key, expiresAt),
  });
  return `${blobUrl(bucket, key)}?${params.toString()}`;
}

export function verifyBlobSignature(
  bucket: BucketName,
  key: string,
  exp: string | null,
  sig: string | null,
): boolean {
  if (!exp || !sig) return false;

  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) return false;

  const expected = Buffer.from(signature(bucket, key, expiresAt));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
