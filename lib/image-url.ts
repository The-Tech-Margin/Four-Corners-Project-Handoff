/**
 * Sized image URLs.
 *
 * Rendition hints ride on the app's own blob URLs: an adapter that can
 * resize serves a smaller image, one that cannot serves the original. The
 * 400px thumbnail params are the grid values; DISPLAY_* is the single-item
 * viewer's rendition (originals run to 25 MB — the rendition paints first).
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { parseAppBlobUrl, blobUrl } from "./storage/blob-url";
import { isVideoUrl } from "./media-utils";

export const IMAGE_BUCKET = "context-media";
export const THUMB_WIDTH = 400;
export const THUMB_QUALITY = 75;
export const DISPLAY_WIDTH = 1600;
export const DISPLAY_QUALITY = 80;

export interface RenderImageOptions {
  width: number;
  quality?: number;
}

/**
 * A sized rendition of an app-hosted image, or null when there is no safe
 * rendition: empty input, data:/blob: payloads, videos, and anything hosted
 * somewhere else. Callers fall back to the original URL.
 */
export function sizedImageUrl(
  url: string | null | undefined,
  options: RenderImageOptions,
): string | null {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("blob:")) return null;
  if (isVideoUrl(url)) return null;

  const parsed = parseAppBlobUrl(url);
  if (!parsed) return null;

  const projectId = new URLSearchParams(url.split("?")[1] ?? "").get("project") ?? undefined;

  return blobUrl(parsed.bucket, parsed.key, {
    projectId,
    width: options.width,
    quality: options.quality ?? THUMB_QUALITY,
  });
}
