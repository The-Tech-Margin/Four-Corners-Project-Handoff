/**
 * Asset resolution for the export engine.
 *
 * For every binary the project references (main image + thumb, context
 * media/thumbs/audio, voice recordings, consent documents) this walks an
 * ordered list of candidate sources and produces an AssetRef with explicit
 * status + origin. A source failure NEVER fails the export — it degrades to
 * the next candidate or a warning.
 *
 * Isomorphic: browser, worker, and Node tests (deps injectable).
 */

import type {
  AssetRef,
  ExportOptions,
  ExportProjectInput,
} from "./types";

export interface AssetResolutionDeps {
  /** Read a media blob from IndexedDB (lib/media-storage). */
  getIdbBlob: (
    id: number,
  ) => Promise<{ blob: Blob; mimeType: string } | undefined>;
  fetchFn: typeof fetch;
  /** Get a fresh signed URL for a private-bucket path via /api/storage/sign. */
  signStoragePath: (bucket: string, path: string) => Promise<string | null>;
}

async function defaultGetIdbBlob(
  id: number,
): Promise<{ blob: Blob; mimeType: string } | undefined> {
  const { mediaStorage } = await import("../media-storage");
  const stored = await mediaStorage.get(id);
  return stored ? { blob: stored.blob, mimeType: stored.mimeType } : undefined;
}

async function defaultSignStoragePath(
  bucket: string,
  path: string,
): Promise<string | null> {
  try {
    const res = await fetch("/api/storage/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, path }),
    });
    if (!res.ok) return null;
    const { signedUrl } = await res.json();
    return signedUrl ?? null;
  } catch {
    return null;
  }
}

export function defaultAssetDeps(): AssetResolutionDeps {
  return {
    getIdbBlob: defaultGetIdbBlob,
    fetchFn: (...args) => fetch(...args),
    signStoragePath: defaultSignStoragePath,
  };
}

// ── Small pure helpers ──────────────────────────────────────────────────────

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  try {
    if (match[2]) {
      const byteString = atob(match[3]);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    }
    return new Blob([decodeURIComponent(match[3])], { type: mimeType });
  } catch {
    return null;
  }
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/quicktime": "mov",
};

export function extensionForMime(mime: string | undefined): string {
  if (!mime) return "bin";
  const base = mime.split(";")[0].trim().toLowerCase();
  if (MIME_TO_EXT[base]) return MIME_TO_EXT[base];
  const subtype = base.split("/")[1];
  return subtype ? subtype.replace(/^x-/, "") : "bin";
}

export function sanitizeAssetFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned || "asset";
}

/** Per-folder filename de-collision: photo.jpg, photo-2.jpg, photo-3.jpg… */
export function createNameAllocator(): (folder: string, name: string) => string {
  const used = new Map<string, Set<string>>();
  return (folder, name) => {
    let names = used.get(folder);
    if (!names) {
      names = new Set();
      used.set(folder, names);
    }
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    let n = 2;
    while (names.has(candidate.toLowerCase())) {
      candidate = `${stem}-${n}${ext}`;
      n++;
    }
    names.add(candidate.toLowerCase());
    return candidate;
  };
}

export function estimateExportSize(
  assets: AssetRef[],
  mode: "zip" | "standalone",
): number {
  const raw = assets.reduce(
    (sum, a) => sum + (a.status === "resolved" ? a.bytes?.size ?? 0 : 0),
    0,
  );
  // Base64 adds ~33% for embedded output
  return mode === "standalone" ? Math.round(raw * 1.33) : raw;
}

// ── Candidate machinery ─────────────────────────────────────────────────────

interface Candidate {
  origin: AssetRef["origin"];
  load: () => Promise<{ blob: Blob; mimeType?: string } | null>;
}

function supabasePublicUrl(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/context-media/${path}` : null;
}

function isVoiceStoragePath(pathOrBucketHint: string): "voice-recordings" | "context-media" {
  return pathOrBucketHint.includes("/voice-recordings/")
    ? "voice-recordings"
    : "context-media";
}

async function fetchAsBlob(
  fetchFn: typeof fetch,
  url: string,
): Promise<{ blob: Blob; mimeType?: string } | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return { blob, mimeType: blob.type || undefined };
  } catch {
    return null;
  }
}

async function resolveFromCandidates(
  candidates: Candidate[],
): Promise<{ blob: Blob; mimeType?: string; origin: AssetRef["origin"] } | null> {
  for (const candidate of candidates) {
    const result = await candidate.load();
    if (result && result.blob.size > 0) {
      return { ...result, origin: candidate.origin };
    }
  }
  return null;
}

// ── Main entry ──────────────────────────────────────────────────────────────

export async function resolveAssets(
  input: ExportProjectInput,
  options: ExportOptions,
  onProgress?: (current: number, total: number, label: string) => void,
  deps: AssetResolutionDeps = defaultAssetDeps(),
): Promise<AssetRef[]> {
  const { metadata, mainImage, consentDocuments } = input;
  const assets: AssetRef[] = [];
  const allocate = createNameAllocator();
  // Dedupe: identical storage URLs resolve once and share bytes + zipPath.
  const byIdentity = new Map<string, AssetRef>();

  const contextItems = metadata.context || [];
  const voiceItems = metadata.voiceTranscriptions || [];
  const docs = options.includeConsentDocs ? consentDocuments : [];

  const total =
    2 + // main image + thumbnail
    contextItems.length * 2 + // media + audio slots
    voiceItems.length +
    Math.max(docs.length, 1); // consent docs (or the ethics-URL fallback)
  let current = 0;
  const tick = (label: string) => {
    current++;
    onProgress?.(current, total, label);
  };

  const push = (asset: AssetRef): AssetRef => {
    assets.push(asset);
    return asset;
  };

  // ── Main image ──
  {
    const candidates: Candidate[] = [];
    if (mainImage.src?.startsWith("data:")) {
      candidates.push({
        origin: "data-url",
        load: async () => {
          const blob = dataUrlToBlob(mainImage.src!);
          return blob ? { blob, mimeType: blob.type } : null;
        },
      });
    } else if (mainImage.src) {
      // http(s) URL — covers current context-media and legacy project-images
      candidates.push({
        origin: "storage-url",
        load: () => fetchAsBlob(deps.fetchFn, mainImage.src!),
      });
    }
    if (mainImage.storagePath) {
      const url = supabasePublicUrl(mainImage.storagePath);
      if (url) {
        candidates.push({
          origin: "storage-url",
          load: () => fetchAsBlob(deps.fetchFn, url),
        });
      }
    }

    if (candidates.length === 0) {
      push({
        refId: "main",
        kind: "main-image",
        filename: "",
        zipPath: "",
        status: "skipped",
      });
    } else {
      const resolved = await resolveFromCandidates(candidates);
      if (resolved) {
        const ext = extensionForMime(resolved.mimeType || resolved.blob.type);
        const filename = allocate("", `image.${ext}`);
        push({
          refId: "main",
          kind: "main-image",
          filename,
          zipPath: filename,
          mimeType: resolved.mimeType || resolved.blob.type || undefined,
          bytes: resolved.blob,
          status: "resolved",
          origin: resolved.origin,
        });
      } else {
        push({
          refId: "main",
          kind: "main-image",
          filename: "",
          zipPath: "",
          status: "failed",
          warning: "Main image could not be fetched",
        });
      }
    }
    tick("Main image");
  }

  // ── Main thumbnail (regenerable — never fails the export) ──
  {
    const candidates: Candidate[] = [];
    if (mainImage.thumbnailUrl) {
      candidates.push({
        origin: "storage-url",
        load: () => fetchAsBlob(deps.fetchFn, mainImage.thumbnailUrl!),
      });
    }
    if (mainImage.thumbnailPath) {
      const url = supabasePublicUrl(mainImage.thumbnailPath);
      if (url) {
        candidates.push({
          origin: "storage-url",
          load: () => fetchAsBlob(deps.fetchFn, url),
        });
      }
    }
    const resolved =
      candidates.length > 0 ? await resolveFromCandidates(candidates) : null;
    if (resolved) {
      const filename = allocate("", "image.thumb.jpg");
      push({
        refId: "main",
        kind: "main-thumbnail",
        filename,
        zipPath: filename,
        mimeType: "image/jpeg",
        bytes: resolved.blob,
        status: "resolved",
        origin: resolved.origin,
      });
    }
    tick("Main thumbnail");
  }

  // ── Context media + thumbnails + audio ──
  for (let i = 0; i < contextItems.length; i++) {
    const item = contextItems[i];
    const label = item.filename || item.caption || `context ${i + 1}`;

    // Media (image/video)
    {
      const identity = item.storage_url || undefined;
      const existing = identity ? byIdentity.get(identity) : undefined;
      if (existing?.status === "resolved") {
        push({ ...existing, refId: item.id, warning: undefined });
      } else {
        const candidates: Candidate[] = [];
        if (typeof item.blobId === "number") {
          candidates.push({
            origin: "idb",
            load: async () => {
              const stored = await deps.getIdbBlob(item.blobId!);
              return stored
                ? { blob: stored.blob, mimeType: stored.mimeType }
                : null;
            },
          });
        }
        if (item.src?.startsWith("data:")) {
          candidates.push({
            origin: "data-url",
            load: async () => {
              const blob = dataUrlToBlob(item.src!);
              return blob ? { blob, mimeType: blob.type } : null;
            },
          });
        }
        if (item.storage_url) {
          candidates.push({
            origin: "storage-url",
            load: () => fetchAsBlob(deps.fetchFn, item.storage_url!),
          });
        }
        if (item.thumbnail_storage_url) {
          candidates.push({
            origin: "thumbnail",
            load: () => fetchAsBlob(deps.fetchFn, item.thumbnail_storage_url!),
          });
        }
        if (item.sourceType === "url" && item.url && /^https?:\/\//.test(item.url)) {
          candidates.push({
            origin: "remote-url",
            load: () => fetchAsBlob(deps.fetchFn, item.url!),
          });
        }

        if (candidates.length === 0) {
          push({
            refId: item.id,
            kind: "context-media",
            filename: "",
            zipPath: "",
            status: "skipped",
          });
        } else {
          const resolved = await resolveFromCandidates(candidates);
          if (resolved) {
            const mime = resolved.mimeType || item.mimeType;
            const base = item.filename
              ? sanitizeAssetFilename(item.filename)
              : `context-${i + 1}.${extensionForMime(mime)}`;
            const filename = allocate("media", base);
            const ref = push({
              refId: item.id,
              kind: "context-media",
              filename,
              zipPath: `media/${filename}`,
              mimeType: mime,
              bytes: resolved.blob,
              status: "resolved",
              origin: resolved.origin,
              warning:
                resolved.origin === "thumbnail"
                  ? `Full-size media for "${label}" unavailable — bundled the thumbnail instead`
                  : undefined,
            });
            if (identity) byIdentity.set(identity, ref);
          } else if (item.sourceType === "url" && item.url) {
            push({
              refId: item.id,
              kind: "context-media",
              filename: "",
              zipPath: "",
              status: "skipped",
              origin: "remote-url",
              warning: `External media "${label}" could not be fetched (CORS or offline) — kept as a URL reference`,
            });
          } else {
            push({
              refId: item.id,
              kind: "context-media",
              filename: "",
              zipPath: "",
              status: "failed",
              warning: `Media for "${label}" could not be resolved from any source`,
            });
          }
        }
      }
      tick(label);
    }

    // Bundled thumbnail (decode-failure fallback for importers; best-effort)
    if (item.thumbnail_storage_url || item.thumbnailDataUrl?.startsWith("data:")) {
      const candidates: Candidate[] = [];
      if (item.thumbnailDataUrl?.startsWith("data:")) {
        candidates.push({
          origin: "data-url",
          load: async () => {
            const blob = dataUrlToBlob(item.thumbnailDataUrl!);
            return blob ? { blob, mimeType: blob.type } : null;
          },
        });
      }
      if (item.thumbnail_storage_url) {
        candidates.push({
          origin: "storage-url",
          load: () => fetchAsBlob(deps.fetchFn, item.thumbnail_storage_url!),
        });
      }
      const resolved = await resolveFromCandidates(candidates);
      if (resolved) {
        const filename = allocate("media/thumbs", `${sanitizeAssetFilename(item.id)}.jpg`);
        push({
          refId: item.id,
          kind: "context-thumbnail",
          filename,
          zipPath: `media/thumbs/${filename}`,
          mimeType: "image/jpeg",
          bytes: resolved.blob,
          status: "resolved",
          origin: resolved.origin,
        });
      }
    }

    // Context audio annotation
    {
      const hasAudio =
        item.audioDataUrl ||
        typeof item.audioBlobId === "number" ||
        item.audioStorageUrl ||
        item.audioStoragePath;
      if (hasAudio) {
        const candidates: Candidate[] = [];
        if (item.audioDataUrl) {
          candidates.push({
            origin: "data-url",
            load: async () => {
              const blob = dataUrlToBlob(item.audioDataUrl!);
              return blob ? { blob, mimeType: blob.type } : null;
            },
          });
        }
        if (typeof item.audioBlobId === "number") {
          candidates.push({
            origin: "idb",
            load: async () => {
              const stored = await deps.getIdbBlob(item.audioBlobId!);
              return stored
                ? { blob: stored.blob, mimeType: stored.mimeType }
                : null;
            },
          });
        }
        if (item.audioStorageUrl) {
          candidates.push({
            origin: "storage-url",
            load: () => fetchAsBlob(deps.fetchFn, item.audioStorageUrl!),
          });
        }
        if (item.audioStoragePath) {
          candidates.push({
            origin: "signed-url",
            load: async () => {
              const url = await deps.signStoragePath(
                isVoiceStoragePath(item.audioStoragePath!),
                item.audioStoragePath!,
              );
              return url ? fetchAsBlob(deps.fetchFn, url) : null;
            },
          });
        }
        const resolved = await resolveFromCandidates(candidates);
        if (resolved) {
          const mime = resolved.mimeType || item.audioMimeType;
          const filename = allocate(
            "audio",
            `${sanitizeAssetFilename(item.id)}.${extensionForMime(mime)}`,
          );
          push({
            refId: item.id,
            kind: "context-audio",
            filename,
            zipPath: `audio/${filename}`,
            mimeType: mime,
            bytes: resolved.blob,
            status: "resolved",
            origin: resolved.origin,
          });
        } else {
          push({
            refId: item.id,
            kind: "context-audio",
            filename: "",
            zipPath: "",
            status: "failed",
            warning: `Audio annotation for "${label}" could not be resolved`,
          });
        }
      }
      tick(`${label} audio`);
    }
  }

  // ── Voice recordings ──
  for (const vt of voiceItems) {
    const label = `voice note ${vt.id.slice(0, 8)}`;
    const candidates: Candidate[] = [];
    if (vt.audioDataUrl) {
      candidates.push({
        origin: "data-url",
        load: async () => {
          const blob = dataUrlToBlob(vt.audioDataUrl!);
          return blob ? { blob, mimeType: blob.type } : null;
        },
      });
    }
    if (typeof vt.audioBlobId === "number") {
      candidates.push({
        origin: "idb",
        load: async () => {
          const stored = await deps.getIdbBlob(vt.audioBlobId!);
          return stored ? { blob: stored.blob, mimeType: stored.mimeType } : null;
        },
      });
    }
    if (vt.audioStorageUrl) {
      candidates.push({
        origin: "storage-url",
        load: () => fetchAsBlob(deps.fetchFn, vt.audioStorageUrl!),
      });
    }
    if (vt.audioStoragePath) {
      candidates.push({
        origin: "signed-url",
        load: async () => {
          const url = await deps.signStoragePath(
            "voice-recordings",
            vt.audioStoragePath!,
          );
          return url ? fetchAsBlob(deps.fetchFn, url) : null;
        },
      });
    }

    if (candidates.length === 0) {
      push({
        refId: vt.id,
        kind: "voice-audio",
        filename: "",
        zipPath: "",
        status: "skipped",
      });
    } else {
      const resolved = await resolveFromCandidates(candidates);
      if (resolved) {
        const mime = resolved.mimeType || vt.mimeType;
        const filename = allocate(
          "voice",
          `${sanitizeAssetFilename(vt.recordingId)}.${extensionForMime(mime)}`,
        );
        push({
          refId: vt.id,
          kind: "voice-audio",
          filename,
          zipPath: `voice/${filename}`,
          mimeType: mime,
          bytes: resolved.blob,
          status: "resolved",
          origin: resolved.origin,
        });
      } else {
        push({
          refId: vt.id,
          kind: "voice-audio",
          filename: "",
          zipPath: "",
          status: "failed",
          warning: `${label} could not be resolved from any source`,
        });
      }
    }
    tick(label);
  }

  // ── Consent documents ──
  if (options.includeConsentDocs) {
    for (const doc of docs) {
      const blob = dataUrlToBlob(doc.dataUrl);
      if (blob) {
        const filename = allocate("docs", sanitizeAssetFilename(doc.name));
        push({
          refId: doc.name,
          kind: "consent-doc",
          filename,
          zipPath: `docs/${filename}`,
          mimeType: doc.type || blob.type || undefined,
          bytes: blob,
          status: "resolved",
          origin: "store",
        });
      } else {
        push({
          refId: doc.name,
          kind: "consent-doc",
          filename: "",
          zipPath: "",
          status: "failed",
          warning: `Consent document "${doc.name}" could not be decoded`,
        });
      }
      tick(doc.name);
    }

    // No device-local docs but the project references one in storage
    // (reopened-project case): fetch, re-signing the path if needed.
    const consentUrl = metadata.ethics?.consentDocumentUrl;
    if (docs.length === 0 && consentUrl) {
      const candidates: Candidate[] = [
        {
          origin: "signed-url",
          load: () => fetchAsBlob(deps.fetchFn, consentUrl),
        },
      ];
      const pathMatch = consentUrl.match(
        /\/storage\/v1\/object\/(?:sign|public)\/consent-documents\/([^?]+)/,
      );
      if (pathMatch) {
        candidates.push({
          origin: "signed-url",
          load: async () => {
            const url = await deps.signStoragePath(
              "consent-documents",
              decodeURIComponent(pathMatch[1]),
            );
            return url ? fetchAsBlob(deps.fetchFn, url) : null;
          },
        });
      }
      const resolved = await resolveFromCandidates(candidates);
      if (resolved) {
        const ext = extensionForMime(resolved.mimeType || resolved.blob.type);
        const filename = allocate("docs", `consent-document.${ext}`);
        push({
          refId: "consent-document",
          kind: "consent-doc",
          filename,
          zipPath: `docs/${filename}`,
          mimeType: resolved.mimeType || resolved.blob.type || undefined,
          bytes: resolved.blob,
          status: "resolved",
          origin: resolved.origin,
        });
      } else {
        push({
          refId: "consent-document",
          kind: "consent-doc",
          filename: "",
          zipPath: "",
          status: "failed",
          warning:
            "Consent document referenced by ethics could not be fetched — reference kept",
        });
      }
      tick("Consent document");
    }
  }

  return assets;
}
