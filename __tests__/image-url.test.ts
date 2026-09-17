/**
 * Sized image URL helper: locks the transform-URL shape byte-for-byte (the
 * string was previously inlined 3× in projects-transforms) and the rewrite
 * safety rules — anything that can't be transformed returns null so callers
 * fall back to the original.
 */

import { describe, it, expect } from "vitest";
import {
  renderImageUrl,
  sizedImageUrl,
  THUMB_WIDTH,
  THUMB_QUALITY,
  DISPLAY_WIDTH,
  DISPLAY_QUALITY,
} from "@/lib/image-url";

const BASE = "https://abc.supabase.co";
const PATH = "user-1/main-images/proj-1.jpg";
const OBJECT_URL = `${BASE}/storage/v1/object/public/context-media/${PATH}`;

describe("renderImageUrl", () => {
  it("emits the exact legacy transform string (param order locked)", () => {
    expect(
      renderImageUrl(BASE, PATH, { width: 400, quality: 75 }),
    ).toBe(
      `${BASE}/storage/v1/render/image/public/context-media/${PATH}?width=400&quality=75&resize=contain`,
    );
  });

  it("honors width/quality overrides and defaults quality", () => {
    expect(renderImageUrl(BASE, PATH, { width: 1600, quality: 80 })).toContain(
      "?width=1600&quality=80&resize=contain",
    );
    expect(renderImageUrl(BASE, PATH, { width: 800 })).toContain(
      `?width=800&quality=${THUMB_QUALITY}&resize=contain`,
    );
  });

  it("keeps nested paths intact", () => {
    const nested = "u/context-images/p/photo name.jpg";
    expect(renderImageUrl(BASE, nested, { width: 400 })).toContain(
      `/context-media/${nested}?`,
    );
  });
});

describe("sizedImageUrl", () => {
  const opts = { width: DISPLAY_WIDTH, quality: DISPLAY_QUALITY };

  it("rewrites a public context-media object URL to its render URL", () => {
    expect(sizedImageUrl(OBJECT_URL, opts)).toBe(
      `${BASE}/storage/v1/render/image/public/context-media/${PATH}?width=${DISPLAY_WIDTH}&quality=${DISPLAY_QUALITY}&resize=contain`,
    );
  });

  it("returns null for everything that cannot be transformed", () => {
    const cases: Array<string | null | undefined> = [
      null,
      undefined,
      "",
      "data:image/png;base64,AAAA",
      "blob:https://abc.supabase.co/uuid",
      `${BASE}/storage/v1/object/public/project-images/legacy.jpg`, // legacy bucket
      "https://example.com/external.jpg",
      `${OBJECT_URL}?token=abc`, // already has a query string
      `${BASE}/storage/v1/render/image/public/context-media/${PATH}?width=400&quality=75&resize=contain`, // already a render URL (query)
      `${BASE}/storage/v1/object/public/context-media/clip.mp4`, // video
      `${BASE}/storage/v1/object/public/context-media/clip.mov`,
    ];
    for (const input of cases) {
      expect(sizedImageUrl(input, opts), `should be null: ${input}`).toBeNull();
    }
  });

  it("constants match the established grid values", () => {
    expect(THUMB_WIDTH).toBe(400);
    expect(THUMB_QUALITY).toBe(75);
    expect(DISPLAY_WIDTH).toBe(1600);
    expect(DISPLAY_QUALITY).toBe(80);
  });
});
