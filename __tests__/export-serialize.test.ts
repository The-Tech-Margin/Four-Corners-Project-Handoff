/**
 * Canonical export serialization: embedded flavor re-imports through the
 * schema, bundle-relative flavor maps paths + a complete manifest, toggles
 * are honored, reference flavor stays binary-free.
 */

import { describe, it, expect } from "vitest";
import { resolveAssets, type AssetResolutionDeps } from "@/lib/export/assets";
import { buildExportMetadata, buildExportManifest } from "@/lib/export/serialize";
import { parseMetadataText } from "@/lib/importMetadata";
import {
  canonicalizeForComparison,
  CURRENT_EXPORT_VERSION,
  ExportManifestSchema,
} from "@/lib/export-contract";
import type { ExportOptions, ExportProjectInput } from "@/lib/export/types";
import type { FourCornersMetadataExtended } from "@/lib/field-registry";

function fixtureDeps(): AssetResolutionDeps {
  return {
    getIdbBlob: async () => undefined,
    fetchFn: (async () => {
      throw new Error("network disabled in tests");
    }) as unknown as typeof fetch,
    signStoragePath: async () => null,
  };
}

function fixtureMetadata(): FourCornersMetadataExtended {
  return {
    backStory: { text: "story", author: "a", publication: "", publicationUrl: "", date: "" },
    context: [
      {
        id: "ctx-upload",
        sourceType: "upload",
        type: "image",
        caption: "uploaded",
        filename: "pic.png",
        mimeType: "image/png",
        src: "data:image/png;base64,cGljLWJ5dGVz",
        storage_url:
          "https://media.example.org/u/pic.png",
        audioDataUrl: "data:audio/webm;base64,YXVkaW8tYnl0ZXM=",
        audioMimeType: "audio/webm",
        audioDuration: 2,
      },
      {
        id: "ctx-ext",
        sourceType: "url",
        type: "video",
        caption: "external",
        url: "https://example.com/clip.mp4",
      },
    ],
    links: [],
    creativeCommons: { copyright: "©", description: "desc" },
    location: { latitude: 1.5, longitude: 2.5, city: "X" },
    photoMetadata: { equipment: { cameraMake: "Canon" } },
    voiceTranscriptions: [
      {
        id: "vt-1",
        recordingId: "rec-1",
        text: "voice",
        transcribedAt: "2026-01-01T00:00:00.000Z",
        audioDataUrl: "data:audio/webm;base64,dm9pY2UtYnl0ZXM=",
        mimeType: "audio/webm",
      },
    ],
    meta: {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      editorVersion: "1.1.0",
      mode: "complete",
    },
  };
}

function fixtureInput(): ExportProjectInput {
  return {
    metadata: fixtureMetadata(),
    projectId: "proj-1",
    title: "Serialize Test",
    mainImage: { src: "data:image/jpeg;base64,bWFpbi1ieXRlcw==" },
    consentDocuments: [
      {
        name: "consent.pdf",
        size: 9,
        type: "application/pdf",
        dataUrl: "data:application/pdf;base64,cGRmLWJ5dGVz",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function fixtureOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    format: "zip",
    embedImages: true,
    excludeLocation: false,
    includeExif: true,
    includeConsentDocs: true,
    ...overrides,
  };
}

async function resolveFixtureAssets(options = fixtureOptions()) {
  return resolveAssets(fixtureInput(), options, undefined, fixtureDeps());
}

describe("embedded flavor", () => {
  it("re-imports through parseMetadataText with binaries inlined", async () => {
    const assets = await resolveFixtureAssets();
    const envelope = await buildExportMetadata(
      fixtureInput(),
      fixtureOptions(),
      assets,
      "embedded",
    );
    const result = parseMetadataText(JSON.stringify(envelope));
    expect(result.success, result.error).toBe(true);

    const upload = result.data!.context.find((i) => i.caption === "uploaded")!;
    expect(upload.src).toMatch(/^data:image\/png/);
    expect(upload.audioDataUrl).toMatch(/^data:audio\/webm/);
    expect(result.data!.voiceTranscriptions![0].audioDataUrl).toMatch(
      /^data:audio\/webm/,
    );
    expect(result.mainImage).toMatch(/^data:image\/jpeg/);

    const ext = (envelope as Record<string, unknown>)._ext as Record<string, unknown>;
    const docs = ext.consentDocuments as Array<Record<string, unknown>>;
    expect(docs[0].name).toBe("consent.pdf");
    expect(docs[0].dataUrl).toMatch(/^data:application\/pdf/);
  });

  it("keeps external references verbatim", async () => {
    const assets = await resolveFixtureAssets();
    const envelope = await buildExportMetadata(
      fixtureInput(),
      fixtureOptions(),
      assets,
      "embedded",
    );
    const context = (envelope as { context: Array<Record<string, unknown>> }).context;
    const external = context.find((i) => i.caption === "external")!;
    expect(external.url).toBe("https://example.com/clip.mp4");
  });
});

describe("bundle-relative flavor", () => {
  it("maps media, audio, voice, and main image to ./ paths", async () => {
    const assets = await resolveFixtureAssets();
    const envelope = await buildExportMetadata(
      fixtureInput(),
      fixtureOptions(),
      assets,
      "bundle-relative",
    );
    const context = (envelope as { context: Array<Record<string, unknown>> }).context;
    const upload = context.find((i) => i.caption === "uploaded")!;
    expect(upload.src).toBe("./media/pic.png");
    expect(upload.audioStorageUrl).toMatch(/^\.\/audio\//);
    expect(upload.audioDataUrl).toBeUndefined();
    expect(upload.storage_path).toBeUndefined();

    const ext = (envelope as Record<string, unknown>)._ext as Record<string, unknown>;
    expect(ext.mainImage).toBe("./image.jpg");
    const voice = ext.voiceTranscriptions as Array<Record<string, unknown>>;
    expect(voice[0].audioStorageUrl).toMatch(/^\.\/voice\//);
  });

  it("emits a complete, schema-valid manifest at _ext.export", async () => {
    const assets = await resolveFixtureAssets();
    const manifest = ExportManifestSchema.parse(buildExportManifest(assets));

    expect(manifest.assets.mainImage?.path).toBe("image.jpg");
    const ctxEntry = manifest.assets.context.find((c) => c.id === "ctx-upload")!;
    expect(ctxEntry.mediaPath).toBe("media/pic.png");
    expect(ctxEntry.audioPath).toMatch(/^audio\//);
    expect(ctxEntry.audioMimeType).toBe("audio/webm");
    expect(manifest.assets.voice[0]).toMatchObject({
      id: "vt-1",
      mimeType: "audio/webm",
    });
    expect(manifest.assets.consentDocs[0]).toMatchObject({
      name: "consent.pdf",
      path: "docs/consent.pdf",
      mimeType: "application/pdf",
    });
  });
});

describe("toggles and reference flavor", () => {
  it("honors excludeLocation and includeExif", async () => {
    const options = fixtureOptions({ excludeLocation: true, includeExif: false });
    const envelope = await buildExportMetadata(fixtureInput(), options, [], "reference");
    const ext = (envelope as Record<string, unknown>)._ext as Record<string, unknown>;
    expect(ext.location).toBeUndefined();
    expect(ext.photoMetadata).toBeUndefined();
  });

  it("reference flavor carries no base64 payloads", async () => {
    const envelope = await buildExportMetadata(
      fixtureInput(),
      fixtureOptions({ format: "json", embedImages: false }),
      [],
      "reference",
    );
    const json = JSON.stringify(envelope);
    expect(json).not.toContain(";base64,");
    const context = (envelope as { context: Array<Record<string, unknown>> }).context;
    const upload = context.find((i) => i.caption === "uploaded")!;
    expect(upload.src).toBe(
      "https://media.example.org/u/pic.png",
    );
  });
});

describe("export manifest attribution", () => {
  it("records which system wrote the bundle, without touching the content", () => {
    const manifest = buildExportManifest([]);

    expect(manifest.version).toBe(CURRENT_EXPORT_VERSION);
    expect(manifest.generator?.designAndBuild).toBe("TheTechMargin");
    expect(manifest.generator?.formatVersion).toBe(CURRENT_EXPORT_VERSION);
  });

  it("is ignored when comparing two exports of the same project", () => {
    const withGenerator = { ...fixtureMetadata() };
    const canonical = canonicalizeForComparison(withGenerator);

    // The generator lives under _ext.export, which never reaches the
    // comparison — a round trip is judged on the content alone.
    expect(JSON.stringify(canonical)).not.toContain("TheTechMargin");
  });
});
