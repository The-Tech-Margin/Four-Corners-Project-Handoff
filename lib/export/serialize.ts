/**
 * Canonical export metadata builder — the single serializer behind every
 * format. Produces the root+`_ext` envelope in three flavors:
 *
 * - "embedded": binaries inlined as base64 data URLs (single-file JSON,
 *   standalone HTML). Self-sufficient 1:1.
 * - "bundle-relative": binaries referenced by ZIP-relative `./` paths;
 *   the authoritative id→path mapping lives in the `_ext.export` manifest.
 * - "reference": no binary work at all — public URLs only (previews and the
 *   metadata-only fast path).
 *
 * Field stripping is contract-driven (lib/export-contract). Ephemeral fields
 * deliberately reappear in the embedded flavor (audioDataUrl) because there
 * the base64 payload IS the transport.
 */

import {
  CURRENT_EXPORT_VERSION,
  EXPORT_STRIPPED_CONTEXT_FIELDS,
  EXPORT_STRIPPED_VOICE_FIELDS,
  omitEphemeral,
  type ExportManifest,
} from "../export-contract";
import type { ContextItem, VoiceTranscription } from "../field-registry";
import type { AssetRef, ExportOptions, ExportProjectInput } from "./types";

export type SerializeFlavor = "embedded" | "bundle-relative" | "reference";

// ── Base64 (worker- and Node-safe; no FileReader) ───────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const mime = blob.type || "application/octet-stream";
  return `data:${mime};base64,${uint8ToBase64(new Uint8Array(buffer))}`;
}

// ── Asset lookup ────────────────────────────────────────────────────────────

function findAsset(
  assets: AssetRef[],
  refId: string,
  kind: AssetRef["kind"],
): AssetRef | undefined {
  return assets.find(
    (a) => a.refId === refId && a.kind === kind && a.status === "resolved",
  );
}

/** Build the `_ext.export` manifest from resolved bundle assets. */
export function buildExportManifest(assets: AssetRef[]): ExportManifest {
  const mainImage = findAsset(assets, "main", "main-image");
  const mainThumb = findAsset(assets, "main", "main-thumbnail");

  const contextIds = [
    ...new Set(
      assets
        .filter(
          (a) =>
            (a.kind === "context-media" ||
              a.kind === "context-thumbnail" ||
              a.kind === "context-audio") &&
            a.status === "resolved",
        )
        .map((a) => a.refId),
    ),
  ];

  return {
    version: CURRENT_EXPORT_VERSION,
    assets: {
      mainImage: mainImage
        ? {
            path: mainImage.zipPath,
            mimeType: mainImage.mimeType,
            thumbnailPath: mainThumb?.zipPath,
          }
        : undefined,
      context: contextIds.map((id) => {
        const media = findAsset(assets, id, "context-media");
        const thumb = findAsset(assets, id, "context-thumbnail");
        const audio = findAsset(assets, id, "context-audio");
        return {
          id,
          mediaPath: media?.zipPath,
          thumbnailPath: thumb?.zipPath,
          audioPath: audio?.zipPath,
          audioMimeType: audio?.mimeType,
        };
      }),
      voice: assets
        .filter((a) => a.kind === "voice-audio" && a.status === "resolved")
        .map((a) => ({
          id: a.refId,
          audioPath: a.zipPath,
          mimeType: a.mimeType,
        })),
      consentDocs: assets
        .filter((a) => a.kind === "consent-doc" && a.status === "resolved")
        .map((a) => ({
          name: a.refId,
          path: a.zipPath,
          mimeType: a.mimeType || "application/octet-stream",
          size: a.bytes?.size ?? 0,
        })),
    },
  };
}

// ── Metadata builder ────────────────────────────────────────────────────────

async function serializeContextItem(
  item: ContextItem,
  assets: AssetRef[],
  options: ExportOptions,
  flavor: SerializeFlavor,
): Promise<Record<string, unknown>> {
  const base = omitEphemeral(item, EXPORT_STRIPPED_CONTEXT_FIELDS) as Record<
    string,
    unknown
  >;
  const media = findAsset(assets, item.id, "context-media");
  const audio = findAsset(assets, item.id, "context-audio");

  if (flavor === "bundle-relative") {
    if (media) {
      base.src = `./${media.zipPath}`;
      base.url = item.sourceType === "url" && item.url ? item.url : `./${media.zipPath}`;
    }
    if (audio) {
      // Repointed at the bundled file so index.html plays offline; import
      // clears it and re-stages from the manifest.
      base.audioStorageUrl = `./${audio.zipPath}`;
      base.audioMimeType = audio.mimeType ?? base.audioMimeType;
    }
    return base;
  }

  if (flavor === "embedded") {
    if (media?.bytes && options.embedImages) {
      const dataUrl = await blobToDataUrl(media.bytes);
      base.src = dataUrl;
      base.url = item.sourceType === "url" && item.url ? item.url : dataUrl;
    } else if (item.sourceType === "upload") {
      base.src = item.storage_url || undefined;
      base.url = item.storage_url || item.url || undefined;
    }
    if (audio?.bytes) {
      base.audioDataUrl = await blobToDataUrl(audio.bytes);
      base.audioMimeType = audio.mimeType ?? base.audioMimeType;
    }
    return base;
  }

  // reference flavor — public URLs only, no binary work
  if (item.sourceType === "upload") {
    base.src = item.storage_url || undefined;
    base.url = item.storage_url || item.url || undefined;
  }
  return base;
}

async function serializeVoice(
  vt: VoiceTranscription,
  assets: AssetRef[],
  flavor: SerializeFlavor,
): Promise<Record<string, unknown>> {
  const base = omitEphemeral(vt, EXPORT_STRIPPED_VOICE_FIELDS) as Record<
    string,
    unknown
  >;
  const audio = findAsset(assets, vt.id, "voice-audio");

  if (flavor === "bundle-relative" && audio) {
    base.audioStorageUrl = `./${audio.zipPath}`;
    base.mimeType = audio.mimeType ?? base.mimeType;
  } else if (flavor === "embedded" && audio?.bytes) {
    base.audioDataUrl = await blobToDataUrl(audio.bytes);
    base.mimeType = audio.mimeType ?? base.mimeType;
  }
  return base;
}

async function resolveMainImageRef(
  input: ExportProjectInput,
  assets: AssetRef[],
  flavor: SerializeFlavor,
): Promise<string | undefined> {
  const main = findAsset(assets, "main", "main-image");
  if (flavor === "bundle-relative") {
    return main ? `./${main.zipPath}` : undefined;
  }
  if (flavor === "embedded") {
    if (main?.bytes) return blobToDataUrl(main.bytes);
    return input.mainImage.src?.startsWith("data:")
      ? input.mainImage.src
      : input.mainImage.src;
  }
  // reference: URLs only
  return input.mainImage.src && !input.mainImage.src.startsWith("data:")
    ? input.mainImage.src
    : undefined;
}

/**
 * Build the canonical export envelope. `assets` may be empty for the
 * "reference" flavor (and for metadata-only JSON exports).
 */
export async function buildExportMetadata(
  input: ExportProjectInput,
  options: ExportOptions,
  assets: AssetRef[],
  flavor: SerializeFlavor,
): Promise<Record<string, unknown>> {
  const { metadata } = input;

  const context = await Promise.all(
    (metadata.context || []).map((item) =>
      serializeContextItem(item, assets, options, flavor),
    ),
  );

  const voiceTranscriptions = metadata.voiceTranscriptions
    ? await Promise.all(
        metadata.voiceTranscriptions.map((vt) =>
          serializeVoice(vt, assets, flavor),
        ),
      )
    : undefined;

  const consentDocuments =
    options.includeConsentDocs && input.consentDocuments.length > 0
      ? await Promise.all(
          input.consentDocuments.map(async (doc) => ({
            name: doc.name,
            type: doc.type,
            size: doc.size,
            uploadedAt: doc.uploadedAt,
            ...(flavor === "embedded" ? { dataUrl: doc.dataUrl } : {}),
          })),
        )
      : undefined;

  const manifest = buildExportManifest(
    flavor === "bundle-relative" ? assets : [],
  );

  return {
    backStory: metadata.backStory,
    context,
    links: metadata.links,
    creativeCommons: metadata.creativeCommons,
    _ext: {
      ethics: metadata.ethics,
      photographerInfo: metadata.photographerInfo,
      location: options.excludeLocation ? undefined : metadata.location,
      photoMetadata: options.includeExif ? metadata.photoMetadata : undefined,
      voiceTranscriptions,
      meta: metadata.meta,
      mainImage: await resolveMainImageRef(input, assets, flavor),
      consentDocuments,
      export: manifest,
    },
  };
}
