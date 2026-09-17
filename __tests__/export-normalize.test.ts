/**
 * Export input normalization: the editor store and a persisted ProjectRecord
 * describing the same project must produce equivalent ExportProjectInput.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeFromStoreState,
  normalizeFromProjectRecord,
  optionsFromEditorState,
  type EditorExportState,
} from "@/lib/export/normalize";
import type { ProjectRecord } from "@/lib/projects/types";
import type { FourCornersMetadataExtended } from "@/lib/field-registry";

function fixtureMetadata(): FourCornersMetadataExtended {
  return {
    backStory: {
      text: "story",
      author: "author",
      publication: "pub",
      publicationUrl: "https://example.com",
      date: "2026-01-01",
    },
    context: [
      {
        id: "ctx-1",
        sourceType: "upload",
        type: "image",
        caption: "caption",
        filename: "pic.jpg",
        mimeType: "image/jpeg",
      },
    ],
    links: [{ title: "Link", url: "https://example.com/a", source: "Src" }],
    creativeCommons: { copyright: "©", description: "desc" },
    meta: {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      editorVersion: "1.1.0",
      mode: "complete",
    },
  };
}

function fixtureEditorState(
  overrides: Partial<EditorExportState> = {},
): EditorExportState {
  const metadata = fixtureMetadata();
  return {
    backStory: metadata.backStory,
    context: metadata.context,
    links: metadata.links,
    creativeCommons: metadata.creativeCommons,
    ethics: metadata.ethics,
    photographerInfo: metadata.photographerInfo,
    location: metadata.location,
    photoMetadata: metadata.photoMetadata,
    voiceTranscriptions: metadata.voiceTranscriptions,
    meta: metadata.meta,
    imageSrc: "data:image/jpeg;base64,aW1n",
    mainImageStoragePath: null,
    consentDocuments: [],
    excludeLocationFromExport: false,
    includeExifInExport: true,
    projectId: "proj-1",
    projectTitle: "My Project",
    projectSlug: "my-project",
    ...overrides,
  };
}

function fixtureRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "proj-1",
    user_id: "user-1",
    slug: "my-project",
    title: "My Project",
    metadata: fixtureMetadata(),
    main_image_url: "https://media.example.org/user-1/main-images/proj-1.jpg",
    main_image_storage_path: "user-1/main-images/proj-1.jpg",
    published: false,
    in_gallery: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeFromStoreState / normalizeFromProjectRecord", () => {
  it("produce identical metadata and title for equivalent projects", () => {
    const fromStore = normalizeFromStoreState(fixtureEditorState());
    const fromRecord = normalizeFromProjectRecord(fixtureRecord());

    expect(fromStore.metadata).toEqual(fromRecord.metadata);
    expect(fromStore.title).toBe(fromRecord.title);
    expect(fromStore.projectId).toBe(fromRecord.projectId);
  });

  it("captures the editor's data-URL main image and device-local consent docs", () => {
    const doc = {
      name: "consent.pdf",
      size: 3,
      type: "application/pdf",
      dataUrl: "data:application/pdf;base64,cGRm",
      uploadedAt: "2026-01-01T00:00:00.000Z",
    };
    const input = normalizeFromStoreState(
      fixtureEditorState({ consentDocuments: [doc] }),
    );
    expect(input.mainImage.src).toBe("data:image/jpeg;base64,aW1n");
    expect(input.consentDocuments).toEqual([doc]);
  });

  it("captures the record's storage URL, paths, and empty consent docs", () => {
    const input = normalizeFromProjectRecord(
      fixtureRecord({
        main_image_thumbnail_url: "https://cdn.example.com/thumb.jpg",
        main_image_thumbnail_path: "user-1/main-images/proj-1.thumb.jpg",
      }),
    );
    expect(input.mainImage.src).toContain("https://");
    expect(input.mainImage.storagePath).toBe("user-1/main-images/proj-1.jpg");
    expect(input.mainImage.thumbnailPath).toBe(
      "user-1/main-images/proj-1.thumb.jpg",
    );
    expect(input.consentDocuments).toEqual([]);
  });

  it("falls back through title → slug → caption for the filename base", () => {
    expect(
      normalizeFromStoreState(
        fixtureEditorState({ projectTitle: null, projectSlug: null }),
      ).title,
    ).toBe("desc");
    expect(
      normalizeFromProjectRecord(fixtureRecord({ title: undefined })).title,
    ).toBe("my-project");
  });

  it("maps editor toggles into engine options", () => {
    const options = optionsFromEditorState(
      { excludeLocationFromExport: true, includeExifInExport: false },
      "zip",
      true,
    );
    expect(options).toEqual({
      format: "zip",
      embedImages: true,
      excludeLocation: true,
      includeExif: false,
      includeConsentDocs: true,
      includeStandaloneInZip: true,
    });
  });
});
