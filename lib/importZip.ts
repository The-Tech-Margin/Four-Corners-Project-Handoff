/**
 * ZIP bundle import — restores a full-project export 1:1.
 *
 * Pure core (extractZipBundle / resolveBundleAssets / applyBundleToMetadata,
 * driven by injected IO) + a thin browser wrapper. Tests drive the core with
 * real buildZipBundle output and fake staging deps.
 *
 * Restoration mapping (everything re-uploads through the existing save
 * path): media → IDB blobId + sourceType "upload", context audio →
 * audioBlobId, voice audio → audioBlobId, main image → data URL, consent
 * docs → device-local store entries. Bundled asset ⇒ ALL foreign storage
 * refs cleared (private-bucket URLs 403/expire; public ones render from the
 * exporter's account). External sourceType:"url" items keep their URLs.
 */

import JSZip from "jszip";
import {
  ExportManifestSchema,
  type ExportManifest,
} from "./export-contract";
import { parseMetadataText } from "./importMetadata";
import type {
  ContextItem,
  FourCornersMetadataExtended,
  VoiceTranscription,
} from "./field-registry";
import { blobToDataUrl } from "./export/serialize";

export const ZIP_MAX_ENTRIES = 500;
export const ZIP_MAX_INFLATED_BYTES = 500 * 1024 * 1024;

// ── Extraction ──────────────────────────────────────────────────────────────

export interface ExtractedBundle {
  metadataText: string;
  manifest: ExportManifest | null;
  /** ZIP-relative paths of all file entries (bundle-root-relative). */
  paths: string[];
  /** Lazily inflate one entry; returns null for unknown paths. Enforces the
   *  cumulative-inflation cap across all reads. */
  readEntry: (path: string) => Promise<Uint8Array | null>;
}

export async function extractZipBundle(
  buffer: ArrayBuffer,
  caps: { maxEntries?: number; maxInflatedBytes?: number } = {},
): Promise<ExtractedBundle> {
  const maxEntries = caps.maxEntries ?? ZIP_MAX_ENTRIES;
  const maxInflatedBytes = caps.maxInflatedBytes ?? ZIP_MAX_INFLATED_BYTES;

  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((f) => !f.dir);

  if (entries.length > maxEntries) {
    throw new Error(
      `ZIP has ${entries.length} entries — exceeds the ${maxEntries}-entry limit`,
    );
  }

  // metadata.json at the root, or inside a single wrapping folder
  // (macOS "compress" style).
  let prefix = "";
  if (!zip.file("metadata.json")) {
    const nested = entries
      .map((e) => e.name.match(/^([^/]+)\/metadata\.json$/))
      .filter((m): m is RegExpMatchArray => m !== null);
    if (nested.length === 1) {
      prefix = `${nested[0][1]}/`;
    } else {
      throw new Error("Not a Four Corners bundle — metadata.json not found");
    }
  }

  let inflatedTotal = 0;
  const guardedRead = async (name: string): Promise<Uint8Array | null> => {
    const file = zip.file(`${prefix}${name}`);
    if (!file) return null;
    const bytes = await file.async("uint8array");
    inflatedTotal += bytes.byteLength;
    if (inflatedTotal > maxInflatedBytes) {
      throw new Error(
        "ZIP inflates beyond the cumulative-size safety limit — aborting import",
      );
    }
    return bytes;
  };

  const metadataBytes = await guardedRead("metadata.json");
  if (!metadataBytes) {
    throw new Error("Not a Four Corners bundle — metadata.json not found");
  }
  const metadataText = new TextDecoder().decode(metadataBytes);

  let manifest: ExportManifest | null = null;
  try {
    const raw = JSON.parse(metadataText);
    const parsed = ExportManifestSchema.safeParse(raw?._ext?.export);
    manifest = parsed.success ? parsed.data : null;
  } catch {
    manifest = null; // parseMetadataText reports the JSON error properly
  }

  return {
    metadataText,
    manifest,
    paths: entries
      .map((e) => e.name)
      .filter((n) => n.startsWith(prefix))
      .map((n) => n.slice(prefix.length)),
    readEntry: guardedRead,
  };
}

// ── Asset mapping ───────────────────────────────────────────────────────────

export interface BundleAssetMap {
  mainImagePath?: string;
  context: Map<
    string,
    { mediaPath?: string; thumbnailPath?: string; audioPath?: string; audioMimeType?: string }
  >;
  voice: Map<string, { audioPath: string; mimeType?: string }>;
  consentDocs: Array<{ name: string; path: string; mimeType: string; size: number }>;
  warnings: string[];
}

const BUNDLE_TEXT_FILES = new Set([
  "metadata.json",
  "manifest.json",
  "index.html",
  "standalone.html",
  "README.txt",
]);

/** Map bundle entries to metadata entities — manifest-first, legacy
 *  folder/filename convention as fallback. */
export function resolveBundleAssets(
  metadata: FourCornersMetadataExtended,
  manifest: ExportManifest | null,
  paths: string[],
): BundleAssetMap {
  const pathSet = new Set(paths);
  const warnings: string[] = [];
  const result: BundleAssetMap = {
    context: new Map(),
    voice: new Map(),
    consentDocs: [],
    warnings,
  };

  const checked = (path: string | undefined, label: string): string | undefined => {
    if (!path) return undefined;
    if (!pathSet.has(path)) {
      warnings.push(`Bundle manifest references missing file "${path}" (${label})`);
      return undefined;
    }
    return path;
  };

  if (manifest) {
    result.mainImagePath = checked(manifest.assets.mainImage?.path, "main image");
    for (const entry of manifest.assets.context) {
      result.context.set(entry.id, {
        mediaPath: checked(entry.mediaPath, `context ${entry.id}`),
        thumbnailPath: checked(entry.thumbnailPath, `context thumb ${entry.id}`),
        audioPath: checked(entry.audioPath, `context audio ${entry.id}`),
        audioMimeType: entry.audioMimeType,
      });
    }
    for (const entry of manifest.assets.voice) {
      const audioPath = checked(entry.audioPath, `voice ${entry.id}`);
      if (audioPath) {
        result.voice.set(entry.id, { audioPath, mimeType: entry.mimeType });
      }
    }
    for (const doc of manifest.assets.consentDocs) {
      const path = checked(doc.path, `consent doc ${doc.name}`);
      if (path) result.consentDocs.push({ ...doc, path });
    }
    return result;
  }

  // Legacy bundles (pre-manifest): main image is the lone root binary;
  // media/* pairs to upload items by filename, then by order.
  const rootBinaries = paths.filter(
    (p) => !p.includes("/") && !BUNDLE_TEXT_FILES.has(p),
  );
  if (rootBinaries.length > 0) {
    result.mainImagePath = rootBinaries[0];
  }

  const mediaFiles = paths.filter(
    (p) => p.startsWith("media/") && p.split("/").length === 2,
  );
  const uploadItems = (metadata.context || []).filter(
    (item) => item.sourceType === "upload",
  );
  const unmatched = new Set(mediaFiles);
  for (const item of uploadItems) {
    if (!item.filename) continue;
    const sanitized = item.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const match = mediaFiles.find(
      (p) => p === `media/${item.filename}` || p === `media/${sanitized}`,
    );
    if (match && unmatched.has(match)) {
      result.context.set(item.id, { mediaPath: match });
      unmatched.delete(match);
    }
  }
  const leftoverItems = uploadItems.filter((i) => !result.context.has(i.id));
  const leftoverFiles = [...unmatched];
  for (let i = 0; i < leftoverItems.length && i < leftoverFiles.length; i++) {
    result.context.set(leftoverItems[i].id, { mediaPath: leftoverFiles[i] });
  }
  if (mediaFiles.length > 0) {
    warnings.push(
      "Legacy bundle without a manifest — media matched by filename/order",
    );
  }

  return result;
}

// ── Application ─────────────────────────────────────────────────────────────

export interface ApplyBundleDeps {
  readEntry: (path: string) => Promise<Uint8Array | null>;
  /** Stage a blob into local media storage; returns the numeric blob id. */
  saveBlob: (blob: Blob, filename: string) => Promise<number>;
  /** Generate a thumbnail data URL for a staged media blob (browser: canvas;
   *  tests: fake). Returning undefined falls back to the bundled thumb. */
  makeThumbnailDataUrl: (
    blob: Blob,
    filename: string,
  ) => Promise<string | undefined>;
}

export interface AppliedBundle {
  metadata: FourCornersMetadataExtended;
  mainImageDataUrl?: string;
  consentDocuments: Array<{
    name: string;
    size: number;
    type: string;
    dataUrl: string;
    uploadedAt: string;
  }>;
  warnings: string[];
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  heic: "image/heic",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

function mimeFromPath(path: string, fallback?: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] || fallback || "application/octet-stream";
}

function clearForeignMediaRefs(item: ContextItem): ContextItem {
  const copy = { ...item };
  delete copy.storage_path;
  delete copy.storage_url;
  delete copy.thumbnail_storage_path;
  delete copy.thumbnail_storage_url;
  return copy;
}

function clearForeignAudioRefs<
  T extends Pick<ContextItem, "audioStoragePath" | "audioStorageUrl" | "audioDataUrl">,
>(item: T): T {
  const copy = { ...item };
  delete copy.audioStoragePath;
  delete copy.audioStorageUrl;
  delete copy.audioDataUrl;
  return copy;
}

function isBundleRef(ref: string | undefined): boolean {
  return !!ref && (ref.startsWith("./") || ref.startsWith("media/"));
}

/**
 * Stage bundle binaries and rewrite the parsed metadata for a clean import:
 * fresh ids everywhere (PK-collision guard), local blob refs, foreign
 * storage refs cleared wherever a bundled asset replaces them.
 */
export async function applyBundleToMetadata(
  metadata: FourCornersMetadataExtended,
  assets: BundleAssetMap,
  deps: ApplyBundleDeps,
): Promise<AppliedBundle> {
  const warnings: string[] = [...assets.warnings];
  let linkedProjectWarned = false;

  const context: ContextItem[] = [];
  for (const item of metadata.context || []) {
    const mapping = assets.context.get(item.id);
    let next: ContextItem = { ...item, id: crypto.randomUUID() };

    if (mapping?.mediaPath) {
      const bytes = await deps.readEntry(mapping.mediaPath);
      if (bytes) {
        const mime = item.mimeType || mimeFromPath(mapping.mediaPath);
        const blob = new Blob([bytes as BlobPart], { type: mime });
        const filename =
          item.filename || mapping.mediaPath.split("/").pop() || "imported";
        const blobId = await deps.saveBlob(blob, filename);

        let thumbnailDataUrl = await deps
          .makeThumbnailDataUrl(blob, filename)
          .catch(() => undefined);
        if (!thumbnailDataUrl && mapping.thumbnailPath) {
          const thumbBytes = await deps.readEntry(mapping.thumbnailPath);
          if (thumbBytes) {
            thumbnailDataUrl = await blobToDataUrl(
              new Blob([thumbBytes as BlobPart], { type: "image/jpeg" }),
            );
          }
        }

        next = clearForeignMediaRefs({
          ...next,
          sourceType: "upload",
          blobId,
          filename,
          mimeType: mime,
          thumbnailDataUrl,
          src: undefined,
          url:
            item.sourceType === "url" && item.url && /^https?:\/\//.test(item.url)
              ? item.url
              : undefined,
        });
      } else {
        warnings.push(
          `Bundled media for "${item.filename || item.caption || item.id}" could not be read`,
        );
      }
    } else if (isBundleRef(item.src) || isBundleRef(item.url)) {
      // Dangling bundle-relative refs with no matching entry
      next = { ...next, src: undefined, url: undefined };
      warnings.push(
        `No bundle file found for "${item.filename || item.caption || item.id}"`,
      );
    }

    if (mapping?.audioPath) {
      const bytes = await deps.readEntry(mapping.audioPath);
      if (bytes) {
        const mime =
          mapping.audioMimeType ||
          item.audioMimeType ||
          mimeFromPath(mapping.audioPath);
        const audioBlobId = await deps.saveBlob(
          new Blob([bytes as BlobPart], { type: mime }),
          mapping.audioPath.split("/").pop() || "audio",
        );
        next = clearForeignAudioRefs({
          ...next,
          audioBlobId,
          audioMimeType: mime,
        });
      } else {
        warnings.push(`Bundled audio for context item could not be read`);
      }
    } else if (isBundleRef(item.audioStorageUrl)) {
      next = clearForeignAudioRefs(next);
    }

    if ((next.linkedProjectId || next.linkedProjectSlug) && !linkedProjectWarned) {
      warnings.push(
        "Linked-project references point at the exporter's projects — relink after import if needed",
      );
      linkedProjectWarned = true;
    }

    context.push(next);
  }

  const voiceTranscriptions: VoiceTranscription[] | undefined =
    metadata.voiceTranscriptions
      ? await Promise.all(
          metadata.voiceTranscriptions.map(async (vt) => {
            const mapping = assets.voice.get(vt.id);
            let next: VoiceTranscription = {
              ...vt,
              id: crypto.randomUUID(),
              recordingId: crypto.randomUUID(),
            };
            if (mapping) {
              const bytes = await deps.readEntry(mapping.audioPath);
              if (bytes) {
                const mime =
                  mapping.mimeType || vt.mimeType || mimeFromPath(mapping.audioPath);
                const audioBlobId = await deps.saveBlob(
                  new Blob([bytes as BlobPart], { type: mime }),
                  mapping.audioPath.split("/").pop() || "voice",
                );
                next = clearForeignAudioRefs({
                  ...next,
                  audioBlobId,
                  mimeType: mime,
                });
              }
            } else if (isBundleRef(vt.audioStorageUrl)) {
              next = clearForeignAudioRefs(next);
            }
            return next;
          }),
        )
      : undefined;

  // Main image
  let mainImageDataUrl: string | undefined;
  if (assets.mainImagePath) {
    const bytes = await deps.readEntry(assets.mainImagePath);
    if (bytes) {
      mainImageDataUrl = await blobToDataUrl(
        new Blob([bytes as BlobPart], { type: mimeFromPath(assets.mainImagePath) }),
      );
    } else {
      warnings.push("Bundled main image could not be read");
    }
  }

  // Consent documents → device-local store entries
  const consentDocuments: AppliedBundle["consentDocuments"] = [];
  for (const doc of assets.consentDocs) {
    const bytes = await deps.readEntry(doc.path);
    if (!bytes) {
      warnings.push(`Bundled consent document "${doc.name}" could not be read`);
      continue;
    }
    consentDocuments.push({
      name: doc.name,
      size: doc.size || bytes.byteLength,
      type: doc.mimeType,
      dataUrl: await blobToDataUrl(new Blob([bytes as BlobPart], { type: doc.mimeType })),
      uploadedAt: new Date().toISOString(),
    });
  }
  if (metadata.ethics?.consentDocumentUrl) {
    warnings.push(
      "ethics.consentDocumentUrl still references the exporting account's storage",
    );
  }

  return {
    metadata: { ...metadata, context, voiceTranscriptions },
    mainImageDataUrl,
    consentDocuments,
    warnings,
  };
}

// ── Browser wrapper ─────────────────────────────────────────────────────────

export interface ZipImportResult {
  success: boolean;
  data?: FourCornersMetadataExtended;
  mainImage?: string;
  consentDocuments?: AppliedBundle["consentDocuments"];
  error?: string;
  warnings?: string[];
}

export async function importZipFile(file: File): Promise<ZipImportResult> {
  try {
    const bundle = await extractZipBundle(await file.arrayBuffer());
    const parsed = parseMetadataText(bundle.metadataText);
    if (!parsed.success || !parsed.data) {
      return { success: false, error: parsed.error, warnings: parsed.warnings };
    }

    const assets = resolveBundleAssets(parsed.data, bundle.manifest, bundle.paths);

    const { mediaStorage } = await import("./media-storage");
    const { generateThumbnail } = await import("./thumbnail");
    const applied = await applyBundleToMetadata(parsed.data, assets, {
      readEntry: bundle.readEntry,
      saveBlob: (blob, filename) => mediaStorage.save(blob, filename),
      makeThumbnailDataUrl: async (blob, filename) => {
        if (!blob.type.startsWith("image/") && !blob.type.startsWith("video/")) {
          return undefined;
        }
        return generateThumbnail(new File([blob], filename, { type: blob.type }));
      },
    });

    // Standalone-flavor fallback: no bundled main image entry but the
    // metadata embeds one.
    const mainImage =
      applied.mainImageDataUrl ||
      (parsed.mainImage?.startsWith("data:") ? parsed.mainImage : undefined);

    const warnings = [...(parsed.warnings ?? []), ...applied.warnings];
    return {
      success: true,
      data: applied.metadata,
      mainImage,
      consentDocuments: applied.consentDocuments,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to import ZIP bundle",
    };
  }
}
