/**
 * Asset resolution: candidate fallback ordering, dedupe by storage identity,
 * filename de-collision, and failure-degrades-to-warning (never throws).
 */

import { describe, it, expect, vi } from "vitest";
import {
  resolveAssets,
  createNameAllocator,
  dataUrlToBlob,
  type AssetResolutionDeps,
} from "@/lib/export/assets";
import type { ExportOptions, ExportProjectInput } from "@/lib/export/types";
import type { ContextItem } from "@/lib/field-registry";

const PNG_DATA_URL = "data:image/png;base64,cGljLWJ5dGVz";

function fixtureItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: "ctx-1",
    sourceType: "upload",
    type: "image",
    caption: "item",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    ...overrides,
  };
}

function fixtureInput(
  context: ContextItem[],
  overrides: Partial<ExportProjectInput> = {},
): ExportProjectInput {
  return {
    metadata: {
      backStory: { text: "", author: "", publication: "", publicationUrl: "", date: "" },
      context,
      links: [],
      creativeCommons: { copyright: "", description: "" },
    },
    title: "Assets Test",
    mainImage: {},
    consentDocuments: [],
    ...overrides,
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

function fetchResponding(
  byUrl: Record<string, { bytes: string; type: string }>,
  calls: string[] = [],
): typeof fetch {
  return (async (url: unknown) => {
    calls.push(String(url));
    const hit = byUrl[String(url)];
    if (!hit) return { ok: false } as Response;
    return {
      ok: true,
      blob: async () => new Blob([hit.bytes], { type: hit.type }),
    } as unknown as Response;
  }) as typeof fetch;
}

function fixtureDeps(overrides: Partial<AssetResolutionDeps> = {}): AssetResolutionDeps {
  return {
    getIdbBlob: async () => undefined,
    fetchFn: (async () => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch,
    signStoragePath: async () => null,
    ...overrides,
  };
}

describe("fallback ordering", () => {
  it("prefers the IDB blob over data URL and storage URL", async () => {
    const assets = await resolveAssets(
      fixtureInput([
        fixtureItem({
          blobId: 7,
          src: PNG_DATA_URL,
          storage_url: "https://cdn.example.com/pic.png",
        }),
      ]),
      fixtureOptions(),
      undefined,
      fixtureDeps({
        getIdbBlob: async () => ({
          blob: new Blob(["idb-bytes"], { type: "image/jpeg" }),
          mimeType: "image/jpeg",
        }),
      }),
    );
    const media = assets.find((a) => a.kind === "context-media")!;
    expect(media.status).toBe("resolved");
    expect(media.origin).toBe("idb");
  });

  it("falls back IDB → data URL → storage URL → thumbnail", async () => {
    const calls: string[] = [];
    const deps = fixtureDeps({
      fetchFn: fetchResponding(
        { "https://cdn.example.com/thumb.jpg": { bytes: "thumb", type: "image/jpeg" } },
        calls,
      ),
    });

    // IDB miss + no data URL + storage 404 → thumbnail, flagged degraded
    const assets = await resolveAssets(
      fixtureInput([
        fixtureItem({
          blobId: 9,
          storage_url: "https://cdn.example.com/missing.jpg",
          thumbnail_storage_url: "https://cdn.example.com/thumb.jpg",
        }),
      ]),
      fixtureOptions(),
      undefined,
      deps,
    );
    const media = assets.find((a) => a.kind === "context-media")!;
    expect(media.origin).toBe("thumbnail");
    expect(media.warning).toContain("thumbnail");
    expect(calls).toContain("https://cdn.example.com/missing.jpg");
  });

  it("keeps external URL items as references when the fetch fails (CORS)", async () => {
    const assets = await resolveAssets(
      fixtureInput([
        fixtureItem({
          id: "ctx-ext",
          sourceType: "url",
          filename: undefined,
          url: "https://elsewhere.example.com/photo.jpg",
        }),
      ]),
      fixtureOptions(),
      undefined,
      fixtureDeps(),
    );
    const media = assets.find((a) => a.kind === "context-media")!;
    expect(media.status).toBe("skipped");
    expect(media.warning).toContain("URL reference");
  });

  it("resolves voice audio via a fresh signed URL when only the path survives", async () => {
    const signStoragePath = vi.fn(async () => "https://signed.example.com/v.webm");
    const assets = await resolveAssets(
      fixtureInput([], {
        metadata: {
          ...fixtureInput([]).metadata,
          voiceTranscriptions: [
            {
              id: "vt-1",
              recordingId: "rec-1",
              text: "t",
              transcribedAt: "2026-01-01T00:00:00.000Z",
              audioStoragePath: "user-1/voice-recordings/p/rec-1.webm",
            },
          ],
        },
      }),
      fixtureOptions(),
      undefined,
      fixtureDeps({
        signStoragePath,
        fetchFn: fetchResponding({
          "https://signed.example.com/v.webm": { bytes: "voice", type: "audio/webm" },
        }),
      }),
    );
    const voice = assets.find((a) => a.kind === "voice-audio")!;
    expect(voice.status).toBe("resolved");
    expect(voice.origin).toBe("signed-url");
    expect(signStoragePath).toHaveBeenCalledWith(
      "voice-recordings",
      "user-1/voice-recordings/p/rec-1.webm",
    );
  });

  it("fetches an ethics-referenced consent doc via path re-signing", async () => {
    const input = fixtureInput([]);
    input.metadata.ethics = {
      noManipulation: false,
      noStaging: false,
      informedConsent: true,
      identityProtected: false,
      consentDocumentUrl:
        "https://abc.supabase.co/storage/v1/object/sign/consent-documents/user-1/doc.pdf?token=expired",
    };
    const assets = await resolveAssets(
      input,
      fixtureOptions(),
      undefined,
      fixtureDeps({
        signStoragePath: async (bucket, path) =>
          bucket === "consent-documents" && path === "user-1/doc.pdf"
            ? "https://signed.example.com/doc.pdf"
            : null,
        fetchFn: fetchResponding({
          "https://signed.example.com/doc.pdf": {
            bytes: "pdf",
            type: "application/pdf",
          },
        }),
      }),
    );
    const doc = assets.find((a) => a.kind === "consent-doc")!;
    expect(doc.status).toBe("resolved");
    expect(doc.zipPath).toMatch(/^docs\//);
  });
});

describe("dedupe and naming", () => {
  it("resolves identical storage URLs once and shares the zip path", async () => {
    const calls: string[] = [];
    const url = "https://cdn.example.com/shared.jpg";
    const assets = await resolveAssets(
      fixtureInput([
        fixtureItem({ id: "a", filename: "shared.jpg", storage_url: url }),
        fixtureItem({ id: "b", filename: "shared.jpg", storage_url: url }),
      ]),
      fixtureOptions(),
      undefined,
      fixtureDeps({
        fetchFn: fetchResponding({ [url]: { bytes: "img", type: "image/jpeg" } }, calls),
      }),
    );
    const media = assets.filter((a) => a.kind === "context-media");
    expect(media).toHaveLength(2);
    expect(media[0].zipPath).toBe(media[1].zipPath);
    expect(calls.filter((c) => c === url)).toHaveLength(1);
  });

  it("de-collides duplicate filenames per folder", async () => {
    const assets = await resolveAssets(
      fixtureInput([
        fixtureItem({ id: "a", src: PNG_DATA_URL }),
        fixtureItem({ id: "b", src: PNG_DATA_URL }),
      ]),
      fixtureOptions(),
      undefined,
      fixtureDeps(),
    );
    const paths = assets
      .filter((a) => a.kind === "context-media")
      .map((a) => a.zipPath);
    expect(paths).toEqual(["media/photo.jpg", "media/photo-2.jpg"]);
  });

  it("createNameAllocator scopes collisions by folder", () => {
    const allocate = createNameAllocator();
    expect(allocate("media", "x.jpg")).toBe("x.jpg");
    expect(allocate("media", "x.jpg")).toBe("x-2.jpg");
    expect(allocate("voice", "x.jpg")).toBe("x.jpg");
  });
});

describe("failure behavior", () => {
  it("degrades hard failures to warnings without throwing", async () => {
    const assets = await resolveAssets(
      fixtureInput(
        [fixtureItem({ storage_url: "https://cdn.example.com/gone.jpg" })],
        { mainImage: { src: "https://cdn.example.com/gone-main.jpg" } },
      ),
      fixtureOptions(),
      undefined,
      fixtureDeps(), // every fetch throws
    );
    const media = assets.find((a) => a.kind === "context-media")!;
    const main = assets.find((a) => a.kind === "main-image")!;
    expect(media.status).toBe("failed");
    expect(media.warning).toBeTruthy();
    expect(main.status).toBe("failed");
  });

  it("dataUrlToBlob rejects malformed data URLs gracefully", () => {
    expect(dataUrlToBlob("not-a-data-url")).toBeNull();
    expect(dataUrlToBlob("data:image/png;base64,!!!not-base64!!!")).toBeNull();
  });
});
