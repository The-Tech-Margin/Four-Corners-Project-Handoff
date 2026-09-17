import { describe, it, expect } from "vitest";
import {
  buildMetadataFromNormalized,
  buildListingMetadata,
  validateMetadata,
} from "@/lib/db/projects-transforms";

/**
 * Minimal valid row factories — only required fields populated.
 * Nullable DB columns are explicitly set to null to mirror real Supabase responses.
 */
function makeNormalizedRow(overrides: Record<string, any> = {}) {
  return {
    id: "proj-1",
    user_id: "user-1",
    slug: "test-project",
    title: "Test",
    author: "Author",
    date: "2024-01-01",
    main_image_url: "",
    published: false,
    in_gallery: false,
    parent_project_id: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    mode: null,
    editor_version: null,
    project_backstory: { text: "", author: "", publication: "", publication_url: "", date: "" },
    project_creative_commons: { copyright: "", description: "" },
    project_photographer_info: null,
    project_ethics: null,
    project_locations: null,
    photo_metadata: null,
    context_items: [],
    links: [],
    voice_transcriptions: [],
    ...overrides,
  };
}

function makeListingRow(overrides: Record<string, any> = {}) {
  return {
    id: "proj-1",
    user_id: "user-1",
    slug: "test-project",
    title: "Test",
    author: "Author",
    date: "2024-01-01",
    main_image_url: "",
    published: false,
    in_gallery: false,
    parent_project_id: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    project_backstory: { text: "", author: "", date: "" },
    project_creative_commons: { copyright: "", description: "" },
    project_ethics: null,
    project_locations: null,
    photo_metadata: null,
    context_items: [],
    links: [],
    ...overrides,
  };
}

// ── Null coalescing in context items ────────────────────────────────────────

describe("buildMetadataFromNormalized — null DB fields", () => {
  it("converts null optional context item fields to undefined", () => {
    const row = makeNormalizedRow({
      context_items: [
        {
          id: "ci-1",
          source_type: "upload",
          media_type: "image",
          position: 0,
          // All nullable columns set to null (as Supabase returns)
          filename: null,
          mime_type: null,
          caption: null,
          url: null,
          storage_url: null,
          storage_path: null,
          thumbnail_storage_path: null,
          thumbnail_storage_url: null,
          description: null,
          credit: null,
          date: null,
        },
      ],
    });

    const result = buildMetadataFromNormalized(row);
    const ci = result.metadata.context[0];

    expect(ci.id).toBe("ci-1");
    // Null optional fields should become undefined, not null
    expect(ci.filename).toBeUndefined();
    expect(ci.mimeType).toBeUndefined();
    expect(ci.url).toBeUndefined();
    expect(ci.src).toBeUndefined();
    expect(ci.storage_path).toBeUndefined();
    expect(ci.storage_url).toBeUndefined();
    expect(ci.thumbnail_storage_path).toBeUndefined();
    expect(ci.thumbnail_storage_url).toBeUndefined();
    expect(ci.description).toBeUndefined();
    expect(ci.credit).toBeUndefined();
    expect(ci.date).toBeUndefined();
  });

  it("converts null optional voice transcription fields to undefined", () => {
    const row = makeNormalizedRow({
      voice_transcriptions: [
        {
          id: "vt-1",
          recording_id: "rec-1",
          text: "Hello",
          transcribed_at: "2024-01-01T00:00:00Z",
          position: 0,
          // All nullable columns
          field_id: null,
          audio_storage_path: null,
          audio_storage_url: null,
          mime_type: null,
          duration: null,
        },
      ],
    });

    const result = buildMetadataFromNormalized(row);
    const vt = result.metadata.voiceTranscriptions![0];

    expect(vt.id).toBe("vt-1");
    expect(vt.text).toBe("Hello");
    // Null optional fields should become undefined, not null
    expect(vt.fieldId).toBeUndefined();
    expect(vt.audioStoragePath).toBeUndefined();
    expect(vt.audioStorageUrl).toBeUndefined();
    expect(vt.mimeType).toBeUndefined();
    expect(vt.duration).toBeUndefined();
  });

  it("produces metadata that passes Zod validation", () => {
    const row = makeNormalizedRow({
      context_items: [
        {
          id: "ci-1",
          source_type: "upload",
          media_type: "image",
          position: 0,
          filename: null,
          mime_type: null,
          caption: null,
          url: null,
          storage_url: null,
          storage_path: null,
          thumbnail_storage_path: null,
          thumbnail_storage_url: null,
          description: null,
          credit: null,
          date: null,
        },
      ],
      voice_transcriptions: [
        {
          id: "vt-1",
          recording_id: "rec-1",
          text: "Test",
          transcribed_at: "2024-01-01T00:00:00Z",
          position: 0,
          field_id: null,
          audio_storage_path: null,
          audio_storage_url: null,
          mime_type: null,
          duration: null,
        },
      ],
    });

    const result = buildMetadataFromNormalized(row);

    // Should not throw — null fields must be coalesced before validation
    expect(() => validateMetadata(result.metadata)).not.toThrow();
  });
});

// ── Null coalescing in listing metadata ─────────────────────────────────────

describe("buildListingMetadata — null DB fields", () => {
  it("converts null optional context item fields to undefined", () => {
    const row = makeListingRow({
      context_items: [
        {
          id: "ci-1",
          source_type: null,
          media_type: null,
          position: 0,
          caption: null,
          description: null,
          credit: null,
          filename: null,
          date: null,
          storage_url: null,
          thumbnail_storage_url: null,
          url: null,
        },
      ],
    });

    const result = buildListingMetadata(row);
    const ci = result.metadata.context[0];

    expect(ci.id).toBe("ci-1");
    expect(ci.sourceType).toBe("upload");
    expect(ci.type).toBe("image");
    expect(ci.caption).toBe("");
    expect(ci.description).toBeUndefined();
    expect(ci.credit).toBeUndefined();
    expect(ci.filename).toBeUndefined();
    expect(ci.date).toBeUndefined();
    expect(ci.storage_url).toBeUndefined();
    expect(ci.thumbnail_storage_url).toBeUndefined();
    expect(ci.url).toBeUndefined();
  });
});
