/**
 * ZIP bundle import, driven by REAL export-engine output: extraction,
 * manifest + legacy mapping, SHA-256 byte identity of bundle bytes vs staged
 * blobs (Layer B), id regeneration, foreign-ref clearing, zip-bomb caps.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { runExport } from "@/lib/export/engine";
import type { AssetResolutionDeps } from "@/lib/export/assets";
import {
  extractZipBundle,
  resolveBundleAssets,
  applyBundleToMetadata,
} from "@/lib/importZip";
import { parseMetadataText } from "@/lib/importMetadata";
import { canonicalizeForComparison } from "@/lib/export-contract";
import type {
  ExportOptions,
  ExportProjectInput,
} from "@/lib/export/types";
import type { FourCornersMetadataExtended } from "@/lib/field-registry";

// ── Fixtures ────────────────────────────────────────────────────────────────

const BYTES = {
  media: "pic-bytes",
  contextAudio: "audio-bytes",
  voice: "voice-bytes",
  main: "main-bytes",
  doc: "pdf-bytes",
};

function b64(text: string): string {
  return btoa(text);
}

function fixtureMetadata(): FourCornersMetadataExtended {
  return {
    backStory: {
      text: "The story",
      author: "Author",
      publication: "Pub",
      publicationUrl: "https://example.com",
      date: "2026-01-01",
    },
    context: [
      {
        id: "ctx-upload",
        sourceType: "upload",
        type: "image",
        caption: "uploaded",
        description: "alt",
        credit: "credit",
        date: "2026-01-02",
        filename: "pic.png",
        mimeType: "image/png",
        src: `data:image/png;base64,${b64(BYTES.media)}`,
        storage_url:
          "https://media.example.org/foreign/pic.png",
        storage_path: "foreign/pic.png",
        audioDataUrl: `data:audio/webm;base64,${b64(BYTES.contextAudio)}`,
        audioMimeType: "audio/webm",
        audioDuration: 3,
        linkedProjectSlug: "sister-project",
      },
      {
        id: "ctx-ext",
        sourceType: "url",
        type: "video",
        caption: "external",
        url: "https://example.com/clip.mp4",
      },
    ],
    links: [{ title: "Link", url: "https://example.com/a", source: "S" }],
    creativeCommons: { copyright: "©", description: "Caption" },
    ethics: {
      noManipulation: true,
      noStaging: false,
      informedConsent: true,
      identityProtected: false,
      consentDetails: "verbal",
      consentDocumentUrl:
        "https://media.example.org/docs/foreign/doc.pdf",
    },
    voiceTranscriptions: [
      {
        id: "vt-1",
        recordingId: "rec-1",
        text: "voice transcript",
        transcribedAt: "2026-01-01T00:00:00.000Z",
        audioDataUrl: `data:audio/webm;base64,${b64(BYTES.voice)}`,
        mimeType: "audio/webm",
        duration: 4,
      },
    ],
    meta: {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      editorVersion: "1.1.0",
      mode: "complete",
    },
  };
}

function fixtureInput(): ExportProjectInput {
  return {
    metadata: fixtureMetadata(),
    projectId: "proj-1",
    title: "Round Trip",
    mainImage: { src: `data:image/jpeg;base64,${b64(BYTES.main)}` },
    consentDocuments: [
      {
        name: "consent.pdf",
        size: BYTES.doc.length,
        type: "application/pdf",
        dataUrl: `data:application/pdf;base64,${b64(BYTES.doc)}`,
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function fixtureOptions(): ExportOptions {
  return {
    format: "zip",
    embedImages: true,
    excludeLocation: false,
    includeExif: true,
    includeConsentDocs: true,
    includeStandaloneInZip: true,
  };
}

function offlineDeps(): AssetResolutionDeps {
  return {
    getIdbBlob: async () => undefined,
    fetchFn: (async () => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch,
    signStoragePath: async () => null,
  };
}

async function sha256(data: Blob | Uint8Array | string): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Blob
        ? new Uint8Array(await data.arrayBuffer())
        : data;
  return createHash("sha256").update(bytes).digest("hex");
}

async function exportAndExtract() {
  const result = await runExport(
    fixtureInput(),
    fixtureOptions(),
    undefined,
    offlineDeps(),
  );
  const bundle = await extractZipBundle(await result.blob.arrayBuffer());
  const parsed = parseMetadataText(bundle.metadataText);
  expect(parsed.success, parsed.error).toBe(true);
  return { result, bundle, metadata: parsed.data! };
}

// ── The round trip ──────────────────────────────────────────────────────────

describe("ZIP export → import round trip", () => {
  it("stages every asset class with hash-identical bytes (Layer B)", async () => {
    const { bundle, metadata } = await exportAndExtract();

    expect(bundle.manifest).not.toBeNull();
    expect(bundle.paths).toContain("metadata.json");
    expect(bundle.paths).toContain("manifest.json");
    expect(bundle.paths).toContain("index.html");
    expect(bundle.paths).toContain("standalone.html");
    expect(bundle.paths).toContain("README.txt");

    const assets = resolveBundleAssets(metadata, bundle.manifest, bundle.paths);
    const staged = new Map<number, Blob>();
    const applied = await applyBundleToMetadata(metadata, assets, {
      readEntry: bundle.readEntry,
      saveBlob: async (blob) => {
        const id = staged.size + 1;
        staged.set(id, blob);
        return id;
      },
      makeThumbnailDataUrl: async () => "data:image/jpeg;base64,dGh1bWI=",
    });

    const upload = applied.metadata.context.find((i) => i.caption === "uploaded")!;
    expect(upload.blobId).toBeDefined();
    expect(await sha256(staged.get(upload.blobId!)!)).toBe(
      await sha256(BYTES.media),
    );

    expect(upload.audioBlobId).toBeDefined();
    expect(await sha256(staged.get(upload.audioBlobId!)!)).toBe(
      await sha256(BYTES.contextAudio),
    );

    const voice = applied.metadata.voiceTranscriptions![0];
    expect(voice.audioBlobId).toBeDefined();
    expect(await sha256(staged.get(voice.audioBlobId!)!)).toBe(
      await sha256(BYTES.voice),
    );

    expect(applied.mainImageDataUrl).toMatch(/^data:image\/jpeg/);
    const mainB64 = applied.mainImageDataUrl!.split(",")[1];
    expect(await sha256(Uint8Array.from(atob(mainB64), (c) => c.charCodeAt(0)))).toBe(
      await sha256(BYTES.main),
    );

    expect(applied.consentDocuments).toHaveLength(1);
    const docB64 = applied.consentDocuments[0].dataUrl.split(",")[1];
    expect(await sha256(Uint8Array.from(atob(docB64), (c) => c.charCodeAt(0)))).toBe(
      await sha256(BYTES.doc),
    );
  });

  it("is metadata value-identical after canonicalization (Layer A)", async () => {
    const { bundle, metadata } = await exportAndExtract();
    const assets = resolveBundleAssets(metadata, bundle.manifest, bundle.paths);
    const staged = new Map<number, Blob>();
    const applied = await applyBundleToMetadata(metadata, assets, {
      readEntry: bundle.readEntry,
      saveBlob: async (blob) => {
        const id = staged.size + 1;
        staged.set(id, blob);
        return id;
      },
      makeThumbnailDataUrl: async () => "data:image/jpeg;base64,dGh1bWI=",
    });

    expect(canonicalizeForComparison(applied.metadata)).toEqual(
      canonicalizeForComparison(fixtureMetadata()),
    );
  });

  it("regenerates ids and clears foreign storage refs (hard rule)", async () => {
    const { bundle, metadata } = await exportAndExtract();
    const assets = resolveBundleAssets(metadata, bundle.manifest, bundle.paths);
    const staged = new Map<number, Blob>();
    const applied = await applyBundleToMetadata(metadata, assets, {
      readEntry: bundle.readEntry,
      saveBlob: async (blob) => {
        const id = staged.size + 1;
        staged.set(id, blob);
        return id;
      },
      makeThumbnailDataUrl: async () => undefined,
    });

    const upload = applied.metadata.context.find((i) => i.caption === "uploaded")!;
    expect(upload.id).not.toBe("ctx-upload");
    expect(upload.sourceType).toBe("upload");
    expect(upload.storage_url).toBeUndefined();
    expect(upload.storage_path).toBeUndefined();
    expect(upload.audioStorageUrl).toBeUndefined();
    expect(upload.audioStoragePath).toBeUndefined();
    expect(upload.audioDataUrl).toBeUndefined();

    const voice = applied.metadata.voiceTranscriptions![0];
    expect(voice.id).not.toBe("vt-1");
    expect(voice.recordingId).not.toBe("rec-1");
    expect(voice.audioStorageUrl).toBeUndefined();

    // External reference kept verbatim; linked-project warning surfaced
    const external = applied.metadata.context.find((i) => i.caption === "external")!;
    expect(external.url).toBe("https://example.com/clip.mp4");
    expect(applied.warnings.join(" ")).toContain("Linked-project");
    expect(applied.warnings.join(" ")).toContain("consentDocumentUrl");
  });

  it("falls back to the bundled thumbnail when regeneration fails", async () => {
    const { bundle, metadata } = await exportAndExtract();
    const assets = resolveBundleAssets(metadata, bundle.manifest, bundle.paths);
    const applied = await applyBundleToMetadata(metadata, assets, {
      readEntry: bundle.readEntry,
      saveBlob: async () => 1,
      makeThumbnailDataUrl: async () => {
        throw new Error("no canvas in tests");
      },
    });
    // Fixture export has no bundled thumbs (no thumbnail sources) — item
    // simply has no thumbnailDataUrl rather than a crash.
    const upload = applied.metadata.context.find((i) => i.caption === "uploaded")!;
    expect(upload.blobId).toBe(1);
  });
});

// ── Extraction guards ───────────────────────────────────────────────────────

describe("extractZipBundle guards", () => {
  it("rejects archives without metadata.json", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "hi");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    await expect(extractZipBundle(buffer)).rejects.toThrow(
      /Not a Four Corners bundle/,
    );
  });

  it("rejects archives over the entry cap", async () => {
    const zip = new JSZip();
    zip.file("metadata.json", "{}");
    zip.file("a.txt", "a");
    zip.file("b.txt", "b");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    await expect(
      extractZipBundle(buffer, { maxEntries: 2 }),
    ).rejects.toThrow(/entries/);
  });

  it("aborts when cumulative inflation exceeds the cap", async () => {
    const zip = new JSZip();
    zip.file("metadata.json", "{}");
    zip.file("media/big.bin", new Uint8Array(64));
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const bundle = await extractZipBundle(buffer, { maxInflatedBytes: 32 });
    await expect(bundle.readEntry("media/big.bin")).rejects.toThrow(
      /safety limit/,
    );
  });

  it("handles a single wrapping folder (macOS-style)", async () => {
    const zip = new JSZip();
    zip.file("my-export/metadata.json", JSON.stringify({ hello: true }));
    zip.file("my-export/media/pic.png", "bytes");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const bundle = await extractZipBundle(buffer);
    expect(bundle.metadataText).toContain("hello");
    expect(bundle.paths).toContain("media/pic.png");
    expect(await bundle.readEntry("media/pic.png")).not.toBeNull();
  });
});

// ── Legacy bundles (pre-manifest) ───────────────────────────────────────────

describe("legacy bundle fallback", () => {
  it("maps the root image and media files by filename", async () => {
    const legacyMetadata = {
      backStory: { text: "", author: "", publication: "", publicationUrl: "", date: "" },
      context: [
        {
          id: "old-1",
          sourceType: "upload",
          type: "image",
          caption: "legacy",
          filename: "pic.png",
          mimeType: "image/png",
        },
      ],
      links: [],
      creativeCommons: { copyright: "", description: "" },
    };
    const zip = new JSZip();
    zip.file("metadata.json", JSON.stringify(legacyMetadata));
    zip.file("my-photo.jpg", BYTES.main);
    zip.file("media/pic.png", BYTES.media);
    zip.file("index.html", "<html></html>");
    zip.file("README.txt", "readme");

    const bundle = await extractZipBundle(
      await zip.generateAsync({ type: "arraybuffer" }),
    );
    expect(bundle.manifest).toBeNull();

    const parsed = parseMetadataText(bundle.metadataText);
    expect(parsed.success, parsed.error).toBe(true);

    const assets = resolveBundleAssets(parsed.data!, null, bundle.paths);
    expect(assets.mainImagePath).toBe("my-photo.jpg");
    expect(assets.context.get("old-1")?.mediaPath).toBe("media/pic.png");
    expect(assets.warnings.join(" ")).toContain("Legacy bundle");

    const staged = new Map<number, Blob>();
    const applied = await applyBundleToMetadata(parsed.data!, assets, {
      readEntry: bundle.readEntry,
      saveBlob: async (blob) => {
        const id = staged.size + 1;
        staged.set(id, blob);
        return id;
      },
      makeThumbnailDataUrl: async () => undefined,
    });
    const item = applied.metadata.context[0];
    expect(await sha256(staged.get(item.blobId!)!)).toBe(await sha256(BYTES.media));
    expect(applied.mainImageDataUrl).toMatch(/^data:image\/jpeg/);
  });
});
