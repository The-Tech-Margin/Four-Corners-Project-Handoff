/**
 * Shared types for the export engine. Everything here must be
 * structured-cloneable — inputs and results cross the Web Worker boundary.
 */

import type { FourCornersMetadataExtended } from "../field-registry";

/** Main image sources, in resolution-preference order. */
export interface ExportMainImage {
  /** data: URL (unsaved editor state) or http(s) URL (persisted project). */
  src?: string;
  /** Storage path in the public context-media bucket (or legacy bucket). */
  storagePath?: string;
  thumbnailUrl?: string;
  thumbnailPath?: string;
}

/** Device-local consent document from the editor store. */
export interface ExportConsentDocument {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  uploadedAt?: string;
}

/** Normalized project snapshot the engine consumes — same shape whether it
 *  came from the live editor store or a persisted ProjectRecord. */
export interface ExportProjectInput {
  metadata: FourCornersMetadataExtended;
  projectId?: string;
  /** Used for download filenames. */
  title: string;
  mainImage: ExportMainImage;
  consentDocuments: ExportConsentDocument[];
}

export type ExportFormat = "json" | "html-standalone" | "html-snippet" | "zip";

export interface ExportOptions {
  format: ExportFormat;
  /** Embed media bytes as base64 (JSON / standalone HTML). */
  embedImages: boolean;
  excludeLocation: boolean;
  includeExif: boolean;
  includeConsentDocs: boolean;
  /** ZIP only: also include standalone.html (auto-disabled above the
   *  STANDALONE_IN_ZIP_MAX_BYTES estimate). */
  includeStandaloneInZip?: boolean;
}

export type AssetKind =
  | "main-image"
  | "main-thumbnail"
  | "context-media"
  | "context-thumbnail"
  | "context-audio"
  | "voice-audio"
  | "consent-doc";

export type AssetOrigin =
  | "idb"
  | "data-url"
  | "storage-url"
  | "signed-url"
  | "thumbnail"
  | "remote-url"
  | "store";

export interface AssetRef {
  /** Owning entity: context item id, voice transcription id, "main", or doc name. */
  refId: string;
  kind: AssetKind;
  /** Sanitized, collision-free basename. */
  filename: string;
  /** ZIP-relative path, e.g. "media/photo.jpg". */
  zipPath: string;
  mimeType?: string;
  bytes?: Blob;
  status: "resolved" | "skipped" | "failed";
  origin?: AssetOrigin;
  warning?: string;
}

export interface ExportProgress {
  stage: "assets" | "serialize" | "html" | "zip" | "done";
  message: string;
  current?: number;
  total?: number;
}

export interface ExportSummaryAsset {
  refId: string;
  kind: AssetKind;
  filename: string;
  status: AssetRef["status"];
  origin?: AssetOrigin;
  warning?: string;
  bytes?: number;
}

export interface ExportSummary {
  assets: ExportSummaryAsset[];
  warnings: string[];
  totalBytes: number;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  summary: ExportSummary;
}

/** JSON exports above this raw size get a warning steering users to ZIP —
 *  base64 inflation (~1.33×) would push them past the 50MB import cap. */
export const JSON_EXPORT_WARN_BYTES = 35 * 1024 * 1024;

/** Skip standalone.html inside ZIP bundles above this asset estimate. */
export const STANDALONE_IN_ZIP_MAX_BYTES = 150 * 1024 * 1024;

/** Download filename base — mirrors the old dialog/export behavior. */
export function sanitizeExportFilename(name: string): string {
  const cleaned = name
    .slice(0, 50)
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "four-corners";
}
