/**
 * Sized image URLs via the Supabase render/transform endpoint.
 *
 * Single source of truth for the transform URL shape that was previously
 * inlined in lib/db/projects-transforms.ts. The 400px thumbnail params are
 * the established grid values; DISPLAY_* is the single-item viewer's
 * right-sized rendition (originals run up to 25MB — the rendition is what
 * paints first, then the viewer upgrades to the original in the background).
 */

import { isVideoUrl } from "./media-utils";

export const IMAGE_BUCKET = "context-media";
export const THUMB_WIDTH = 400;
export const THUMB_QUALITY = 75;
export const DISPLAY_WIDTH = 1600;
export const DISPLAY_QUALITY = 80;

const PUBLIC_OBJECT_MARKER = `/storage/v1/object/public/${IMAGE_BUCKET}/`;

export interface RenderImageOptions {
  width: number;
  quality?: number;
}

/** Transform URL from a bucket-relative storage path. Param order must stay
 *  width → quality → resize (the shape the grid has always emitted). */
export function renderImageUrl(
  supabaseUrl: string,
  path: string,
  options: RenderImageOptions,
): string {
  const quality = options.quality ?? THUMB_QUALITY;
  return `${supabaseUrl}/storage/v1/render/image/public/${IMAGE_BUCKET}/${path}?width=${options.width}&quality=${quality}&resize=contain`;
}

/**
 * Rewrite a public context-media object URL into its sized render URL.
 * Returns null when no safe rendition exists — falsy input, data:/blob:
 * payloads, videos, URLs that already carry a query string, and anything
 * outside the context-media public-object path (legacy project-images,
 * external references, already-render URLs). Callers fall back to the
 * original URL.
 */
export function sizedImageUrl(
  url: string | null | undefined,
  options: RenderImageOptions,
): string | null {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("blob:")) return null;
  if (url.includes("?")) return null;
  if (isVideoUrl(url)) return null;

  const marker = url.indexOf(PUBLIC_OBJECT_MARKER);
  if (marker === -1) return null;

  const base = url.slice(0, marker);
  const path = url.slice(marker + PUBLIC_OBJECT_MARKER.length);
  if (!base.startsWith("http") || !path) return null;

  return renderImageUrl(base, path, options);
}
