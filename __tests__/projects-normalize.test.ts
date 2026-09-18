import { describe, it, expect } from "vitest";
import { normalizeForPersistence } from "@/lib/projects/normalize";
import type { ContextItem } from "@/lib/field-registry";
import { createEmptyMetadata } from "@/lib/schema";
import type { FourCornersMetadataExtended } from "@/lib/schema";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function contextItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: "ctx-1",
    sourceType: "upload",
    type: "image",
    caption: "",
    ...overrides,
  };
}

function metadata(overrides: Partial<FourCornersMetadataExtended> = {}): FourCornersMetadataExtended {
  return { ...createEmptyMetadata(), ...overrides };
}

describe("normalizeForPersistence", () => {
  it("drops browser-only carriers for pending uploads", () => {
    const result = normalizeForPersistence({
      ownerId: OWNER,
      metadata: metadata({
        context: [
          contextItem({
            blobId: 7,
            thumbnailDataUrl: "data:image/png;base64,AAA",
            audioBlobId: 9,
            audioDataUrl: "data:audio/webm;base64,BBB",
          }),
        ],
      }),
    });

    const item = result.metadata.context[0];
    expect(item.blobId).toBeUndefined();
    expect(item.thumbnailDataUrl).toBeUndefined();
    expect(item.audioBlobId).toBeUndefined();
    expect(item.audioDataUrl).toBeUndefined();
  });

  it("keeps keys and drops the URLs derived from them", () => {
    const result = normalizeForPersistence({
      ownerId: OWNER,
      metadata: metadata({
        context: [
          contextItem({
            storage_path: `${OWNER}/context-images/p1/photo.jpg`,
            storage_url: "/api/blobs/context-media/anything",
            src: "/api/blobs/context-media/anything",
            thumbnail_storage_path: `${OWNER}/context-images/p1/thumbs/photo.jpg`,
            thumbnail_storage_url: "/api/blobs/context-media/anything",
          }),
        ],
      }),
    });

    const item = result.metadata.context[0];
    expect(item.storage_path).toBe(`${OWNER}/context-images/p1/photo.jpg`);
    expect(item.storage_url).toBeUndefined();
    expect(item.thumbnail_storage_url).toBeUndefined();
    expect(item.src).toBeUndefined();
  });

  it("keeps an external URL that has no key behind it", () => {
    const result = normalizeForPersistence({
      ownerId: OWNER,
      metadata: metadata({
        context: [contextItem({ sourceType: "url", url: "https://example.org/photo.jpg" })],
      }),
    });
    expect(result.metadata.context[0].url).toBe("https://example.org/photo.jpg");
  });

  it("refuses a key that belongs to another account", () => {
    const result = normalizeForPersistence({
      ownerId: OWNER,
      metadata: metadata({
        voiceTranscriptions: [
          {
            id: "v1",
            recordingId: "r1",
            text: "note",
            transcribedAt: "2026-01-01T00:00:00.000Z",
            audioStoragePath: `${OTHER}/voice-recordings/p1/r1.webm`,
          },
        ],
      }),
    });

    expect(result.metadata.voiceTranscriptions?.[0].audioStoragePath).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("another account");
  });

  it("never stores inline image data as the main image", () => {
    const result = normalizeForPersistence({
      ownerId: OWNER,
      metadata: metadata(),
      mainImage: { kind: "url", url: "data:image/png;base64,AAA" },
    });
    expect(result.mainImage).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("keeps an owned main image with its thumbnail", () => {
    const result = normalizeForPersistence({
      ownerId: OWNER,
      metadata: metadata(),
      mainImage: {
        kind: "blob",
        key: `${OWNER}/main-images/p1.jpg`,
        thumbnailKey: `${OWNER}/main-images/p1.thumb.jpg`,
      },
    });
    expect(result.mainImage).toEqual({
      kind: "blob",
      key: `${OWNER}/main-images/p1.jpg`,
      thumbnailKey: `${OWNER}/main-images/p1.thumb.jpg`,
    });
  });
});
