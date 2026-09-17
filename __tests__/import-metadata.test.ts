/**
 * Import pipeline tests: parseMetadataText, normalizeImportedContextItem,
 * validateImportFile. Guards the field-fidelity contract — imports must
 * never rebuild items from hand-listed field subsets.
 */

import { describe, it, expect } from "vitest";
import {
  parseMetadataText,
  normalizeImportedContextItem,
  regenerateImportedIds,
  validateImportFile,
} from "@/lib/importMetadata";
import { CURRENT_EXPORT_VERSION } from "@/lib/export-contract";
import type { ContextItem } from "@/lib/field-registry";

// ── Local fixtures ──────────────────────────────────────────────────────────

function fixtureContextItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: "ctx-1",
    sourceType: "upload",
    type: "image",
    caption: "a caption",
    ...overrides,
  };
}

function fixtureExportJson(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    backStory: {
      text: "the story",
      author: "the author",
      publication: "",
      publicationUrl: "",
      date: "2026-01-01",
    },
    context: [],
    links: [],
    creativeCommons: { copyright: "©", description: "desc" },
    _ext: {
      meta: {
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        editorVersion: CURRENT_EXPORT_VERSION,
        mode: "complete",
      },
    },
    ...overrides,
  };
}

function parseFixture(overrides: Record<string, unknown> = {}) {
  return parseMetadataText(JSON.stringify(fixtureExportJson(overrides)));
}

function fixtureFile(name: string, size = 1024): File {
  return { name, size } as File;
}

// ── parseMetadataText: field fidelity ───────────────────────────────────────

describe("parseMetadataText field fidelity", () => {
  it("preserves every content and identity field on context items", () => {
    const item = fixtureContextItem({
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      url: "https://cdn.example.com/photo.jpg",
      src: "https://cdn.example.com/photo.jpg",
      description: "alt text",
      credit: "Photo by Test",
      date: "2026-01-14",
      linkedProjectId: "proj-9",
      linkedProjectSlug: "linked-slug",
      storage_url: "https://supabase.example.com/storage/v1/object/public/x",
      thumbnail_storage_url:
        "https://supabase.example.com/storage/v1/object/public/x.thumb",
      audioStorageUrl: "https://supabase.example.com/storage/v1/object/sign/a",
      audioMimeType: "audio/webm",
      audioDuration: 12.5,
    });

    const result = parseFixture({ context: [item] });
    expect(result.success, result.error).toBe(true);

    const imported = result.data!.context[0];
    expect(imported.description).toBe("alt text");
    expect(imported.credit).toBe("Photo by Test");
    expect(imported.date).toBe("2026-01-14");
    expect(imported.linkedProjectId).toBe("proj-9");
    expect(imported.linkedProjectSlug).toBe("linked-slug");
    expect(imported.storage_url).toBe(item.storage_url);
    expect(imported.thumbnail_storage_url).toBe(item.thumbnail_storage_url);
    expect(imported.audioStorageUrl).toBe(item.audioStorageUrl);
    expect(imported.audioMimeType).toBe("audio/webm");
    expect(imported.audioDuration).toBe(12.5);
    expect(imported.filename).toBe("photo.jpg");
    expect(imported.caption).toBe("a caption");
  });

  it("preserves voice transcriptions verbatim", () => {
    const vt = {
      id: "vt-1",
      recordingId: "rec-1",
      text: "spoken words",
      transcribedAt: "2026-01-01T00:00:00.000Z",
      fieldId: "backstory",
      audioStorageUrl: "https://supabase.example.com/storage/v1/object/sign/v",
      mimeType: "audio/webm",
      duration: 4.2,
    };
    const result = parseFixture({
      _ext: {
        voiceTranscriptions: [vt],
        meta: {
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          editorVersion: CURRENT_EXPORT_VERSION,
          mode: "complete",
        },
      },
    });
    expect(result.success, result.error).toBe(true);
    expect(result.data!.voiceTranscriptions![0]).toEqual(vt);
  });
});

// ── parseMetadataText: _ext un-nesting ──────────────────────────────────────

describe("parseMetadataText _ext handling", () => {
  it("un-nests _ext fields to the top level", () => {
    const result = parseFixture({
      _ext: {
        ethics: {
          noManipulation: true,
          noStaging: false,
          informedConsent: true,
          identityProtected: false,
          consentDetails: "verbal consent",
        },
        photographerInfo: { bio: "bio", contact: "c@example.com" },
        location: { latitude: 40.7, longitude: -74.0, city: "NYC" },
        meta: {
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          editorVersion: CURRENT_EXPORT_VERSION,
          mode: "standard",
        },
      },
    });

    expect(result.success, result.error).toBe(true);
    expect(result.data!.ethics?.noManipulation).toBe(true);
    expect(result.data!.ethics?.consentDetails).toBe("verbal consent");
    expect(result.data!.photographerInfo?.bio).toBe("bio");
    expect(result.data!.location?.city).toBe("NYC");
    expect(result.data!.meta?.mode).toBe("standard");
    expect(result.data!.meta?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("extracts _ext.mainImage into the result, not the metadata", () => {
    const dataUrl = "data:image/png;base64,AAAA";
    const result = parseFixture({
      _ext: { mainImage: dataUrl },
    });
    expect(result.success, result.error).toBe(true);
    expect(result.mainImage).toBe(dataUrl);
    expect(result.data).not.toHaveProperty("mainImage");
  });

  it("strips unknown _ext keys (e.g. the export manifest) from metadata", () => {
    const result = parseFixture({
      _ext: {
        export: { version: CURRENT_EXPORT_VERSION, assets: { context: [] } },
      },
    });
    expect(result.success, result.error).toBe(true);
    expect(result.data).not.toHaveProperty("export");
  });
});

// ── normalizeImportedContextItem ────────────────────────────────────────────

describe("normalizeImportedContextItem", () => {
  it("backfills a missing id", () => {
    const normalized = normalizeImportedContextItem(
      fixtureContextItem({ id: "" }),
    );
    expect(normalized.id).toBeTruthy();
    expect(normalized.id).not.toBe("");
  });

  it("keeps an existing id", () => {
    const normalized = normalizeImportedContextItem(fixtureContextItem());
    expect(normalized.id).toBe("ctx-1");
  });

  it("mirrors url into missing src and vice versa", () => {
    const fromUrl = normalizeImportedContextItem(
      fixtureContextItem({ url: "https://example.com/a.jpg", src: undefined }),
    );
    expect(fromUrl.src).toBe("https://example.com/a.jpg");

    const fromSrc = normalizeImportedContextItem(
      fixtureContextItem({ src: "data:image/png;base64,AA", url: undefined }),
    );
    expect(fromSrc.url).toBe("data:image/png;base64,AA");
  });

  it("never pollutes src/url with empty strings", () => {
    const normalized = normalizeImportedContextItem(
      fixtureContextItem({ src: "", url: "" }),
    );
    expect(normalized.src).toBeUndefined();
    expect(normalized.url).toBeUndefined();
  });

  it("preserves unrecognized-but-valid schema fields via spread", () => {
    const normalized = normalizeImportedContextItem(
      fixtureContextItem({ credit: "keep me", audioDuration: 3 }),
    );
    expect(normalized.credit).toBe("keep me");
    expect(normalized.audioDuration).toBe(3);
  });
});

// ── regenerateImportedIds ───────────────────────────────────────────────────
// syncContextItems inserts client ids as context_items PKs — a same-account
// reimport that kept the exporter's ids 409s on save. Every non-ZIP import
// path must regenerate.

describe("regenerateImportedIds", () => {
  const metadata = () => ({
    backStory: { text: "", author: "", publication: "", publicationUrl: "", date: "" },
    context: [
      fixtureContextItem({ id: "exporter-ctx-1", blobId: 7, credit: "keep" }),
      fixtureContextItem({
        id: "exporter-ctx-2",
        linkedProjectId: "proj-9",
        linkedProjectSlug: "linked",
      }),
    ],
    links: [],
    creativeCommons: { copyright: "", description: "" },
    voiceTranscriptions: [
      {
        id: "exporter-vt-1",
        recordingId: "exporter-rec-1",
        text: "voice",
        transcribedAt: "2026-01-01T00:00:00.000Z",
        audioBlobId: 11,
      },
    ],
  });

  it("replaces every context and voice id with a fresh one", () => {
    const result = regenerateImportedIds(metadata());
    expect(result.context[0].id).not.toBe("exporter-ctx-1");
    expect(result.context[1].id).not.toBe("exporter-ctx-2");
    expect(result.context[0].id).not.toBe(result.context[1].id);
    expect(result.voiceTranscriptions![0].id).not.toBe("exporter-vt-1");
    expect(result.voiceTranscriptions![0].recordingId).not.toBe("exporter-rec-1");
  });

  it("preserves staged blobs, content fields, and linked-project references", () => {
    const result = regenerateImportedIds(metadata());
    expect(result.context[0].blobId).toBe(7);
    expect(result.context[0].credit).toBe("keep");
    expect(result.context[1].linkedProjectId).toBe("proj-9");
    expect(result.context[1].linkedProjectSlug).toBe("linked");
    expect(result.voiceTranscriptions![0].audioBlobId).toBe(11);
    expect(result.voiceTranscriptions![0].text).toBe("voice");
  });

  it("leaves absent voiceTranscriptions absent", () => {
    const { voiceTranscriptions: _unused, ...noVoice } = metadata();
    void _unused;
    const result = regenerateImportedIds(noVoice);
    expect(result.voiceTranscriptions).toBeUndefined();
  });
});

// ── Version handling ────────────────────────────────────────────────────────

describe("parseMetadataText version handling", () => {
  const versionWarning = (warnings: string[] | undefined) =>
    warnings?.find((w) => w.includes("editor version"));

  it("warns on an unknown _ext.export.version", () => {
    const result = parseFixture({
      _ext: { export: { version: "9.9.9", assets: { context: [] } } },
    });
    expect(result.success).toBe(true);
    expect(versionWarning(result.warnings)).toContain("9.9.9");
  });

  it("falls back to _ext.meta.editorVersion for the check", () => {
    const result = parseFixture({
      _ext: {
        meta: {
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          editorVersion: "8.0.0",
          mode: "complete",
        },
      },
    });
    expect(result.success).toBe(true);
    expect(versionWarning(result.warnings)).toContain("8.0.0");
  });

  it("does not warn for the current or legacy versions", () => {
    for (const version of [CURRENT_EXPORT_VERSION, "1.0.0"]) {
      const result = parseFixture({
        _ext: { export: { version, assets: { context: [] } } },
      });
      expect(result.success).toBe(true);
      expect(versionWarning(result.warnings)).toBeUndefined();
    }
  });

  it("does not warn when no version is declared (legacy files)", () => {
    const { _ext: _unused, ...noExt } = fixtureExportJson();
    void _unused;
    const result = parseMetadataText(JSON.stringify(noExt));
    expect(result.success).toBe(true);
    expect(versionWarning(result.warnings)).toBeUndefined();
  });

  it("stamps the current version into defaulted meta", () => {
    const { _ext: _unused, ...noExt } = fixtureExportJson();
    void _unused;
    const result = parseMetadataText(JSON.stringify(noExt));
    expect(result.success).toBe(true);
    expect(result.data!.meta?.editorVersion).toBe(CURRENT_EXPORT_VERSION);
  });
});

// ── Failure paths ───────────────────────────────────────────────────────────

describe("parseMetadataText failure paths", () => {
  it("reports malformed JSON", () => {
    const result = parseMetadataText("{ not json");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid JSON");
  });

  it("reports Zod validation failures with field paths", () => {
    const result = parseFixture({
      context: [fixtureContextItem({ type: "hologram" as ContextItem["type"] })],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Validation failed");
    expect(result.error).toContain("context");
  });
});

// ── validateImportFile ──────────────────────────────────────────────────────

describe("validateImportFile", () => {
  const MB = 1024 * 1024;

  it("accepts .json, .zip, and .html", () => {
    expect(validateImportFile(fixtureFile("export.json")).valid).toBe(true);
    expect(validateImportFile(fixtureFile("export.zip")).valid).toBe(true);
    expect(validateImportFile(fixtureFile("export.html")).valid).toBe(true);
    expect(validateImportFile(fixtureFile("EXPORT.JSON")).valid).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    const result = validateImportFile(fixtureFile("export.txt"));
    expect(result.valid).toBe(false);
    expect(result.error).toContain(".html");
  });

  it("caps .json and .html at 50MB", () => {
    expect(validateImportFile(fixtureFile("big.json", 51 * MB)).valid).toBe(false);
    expect(validateImportFile(fixtureFile("big.html", 51 * MB)).valid).toBe(false);
    expect(validateImportFile(fixtureFile("ok.json", 49 * MB)).valid).toBe(true);
  });

  it("caps .zip at 200MB", () => {
    expect(validateImportFile(fixtureFile("bundle.zip", 51 * MB)).valid).toBe(true);
    const tooBig = validateImportFile(fixtureFile("bundle.zip", 201 * MB));
    expect(tooBig.valid).toBe(false);
    expect(tooBig.error).toContain("200 MB");
  });
});
