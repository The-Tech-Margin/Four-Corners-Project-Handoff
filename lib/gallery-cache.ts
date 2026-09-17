/** Shared in-memory cache for the public gallery feed. */

interface CacheEntry {
  data: string;
  expiresAt: number;
}

export const galleryCache = new Map<string, CacheEntry>();

/** TTL for in-memory gallery cache entries (ms). */
export const GALLERY_CACHE_TTL_MS = 60_000; // 60 seconds

export function getGalleryCacheKey(limit: number, offset: number) {
  return `gallery:${limit}:${offset}`;
}

/** Clear all in-memory gallery cache entries. */
export function clearGalleryCache() {
  galleryCache.clear();
}
