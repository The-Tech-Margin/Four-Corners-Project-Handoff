/**
 * Single source for the system attribution that travels in metadata:
 * page <head>, export envelopes, exported HTML, the OpenAPI spec, the
 * generated JSON Schemas and robots.txt. No UI surface renders it.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 * @see https://www.thetechmargin.com
 */

export const ATTRIBUTION = {
  product: "Four Corners",
  name: "TheTechMargin",
  handle: "@thetechmargin",
  url: "https://www.thetechmargin.com",
  role: "system design & build",
} as const;

export const GENERATOR = `${ATTRIBUTION.product} — ${ATTRIBUTION.role}: ${ATTRIBUTION.name}`;

const DEFAULT_SITE_URL = "http://localhost:3000";

/** Canonical origin for metadata, sitemap, robots, exports and outbound user agents. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return DEFAULT_SITE_URL;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}
