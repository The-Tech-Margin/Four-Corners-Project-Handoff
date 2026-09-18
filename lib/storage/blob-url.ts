/**
 * Blob URLs are app routes, never vendor URLs, so switching storage never
 * rewrites stored data:
 *
 *   /api/blobs/<bucket>/<key>              public object
 *   /api/blobs/<bucket>/<key>?project=<id> private object reachable through
 *                                          a published project
 *   /api/blobs/<bucket>/<key>?exp=…&sig=…  short-lived signed link
 *
 * Isomorphic: the browser builds the same paths the server does.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { BucketName } from "@/lib/ports/blob-storage";
import { isBucketName } from "@/lib/ports/blob-storage";

export const BLOB_ROUTE_PREFIX = "/api/blobs";

export interface BlobUrlOptions {
  /** Grants access to a private object through this published project. */
  projectId?: string;
  /** Image rendition hints; adapters that cannot resize serve the original. */
  width?: number;
  quality?: number;
}

export function blobUrl(
  bucket: BucketName,
  key: string,
  options: BlobUrlOptions = {},
): string {
  const path = `${BLOB_ROUTE_PREFIX}/${bucket}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const params = new URLSearchParams();
  if (options.projectId) params.set("project", options.projectId);
  if (options.width) params.set("w", String(options.width));
  if (options.quality) params.set("q", String(options.quality));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function isAppBlobUrl(url: string): boolean {
  return url.startsWith(BLOB_ROUTE_PREFIX) || url.includes(`${BLOB_ROUTE_PREFIX}/`);
}

/** Pull the bucket and key back out of an app blob URL. */
export function parseAppBlobUrl(url: string): { bucket: BucketName; key: string } | null {
  const index = url.indexOf(`${BLOB_ROUTE_PREFIX}/`);
  if (index === -1) return null;

  const rest = url.slice(index + BLOB_ROUTE_PREFIX.length + 1).split("?")[0];
  const [bucket, ...keyParts] = rest.split("/");
  if (!bucket || keyParts.length === 0 || !isBucketName(bucket)) return null;

  try {
    return { bucket, key: keyParts.map(decodeURIComponent).join("/") };
  } catch {
    return null;
  }
}
