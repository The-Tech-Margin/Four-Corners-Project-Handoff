/**
 * Sized image URLs: a rendition is only ever requested for an app-hosted
 * image, and anything else returns null so callers fall back to the
 * original URL.
 */

import { describe, it, expect } from "vitest";
import {
  sizedImageUrl,
  THUMB_WIDTH,
  THUMB_QUALITY,
  DISPLAY_WIDTH,
  DISPLAY_QUALITY,
} from "@/lib/image-url";
import { blobUrl } from "@/lib/storage/blob-url";

const KEY = "user-1/main-images/proj-1.jpg";
const IMAGE_URL = blobUrl("context-media", KEY);

describe("sizedImageUrl", () => {
  it("asks for a rendition of an app-hosted image", () => {
    const url = sizedImageUrl(IMAGE_URL, { width: THUMB_WIDTH, quality: THUMB_QUALITY });
    expect(url).toContain(`/api/blobs/context-media/`);
    expect(url).toContain(`w=${THUMB_WIDTH}`);
    expect(url).toContain(`q=${THUMB_QUALITY}`);
  });

  it("keeps the project grant so a public viewer can still load it", () => {
    const scoped = blobUrl("context-media", KEY, { projectId: "p1" });
    expect(sizedImageUrl(scoped, { width: DISPLAY_WIDTH, quality: DISPLAY_QUALITY })).toContain(
      "project=p1",
    );
  });

  it("returns null for anything it cannot resize", () => {
    for (const input of [
      "",
      null,
      undefined,
      "data:image/png;base64,AAA",
      "blob:http://localhost/abc",
      "https://example.org/photo.jpg",
      blobUrl("context-media", "user-1/context-images/p1/clip.mp4"),
    ]) {
      expect(sizedImageUrl(input as string | null | undefined, { width: 400 })).toBeNull();
    }
  });
});
