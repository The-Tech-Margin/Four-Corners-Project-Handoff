/**
 * Export orchestrator — resolve assets, serialize, build the requested
 * format. Runs identically in the Web Worker and on the main-thread
 * fallback. No DOM, no Zustand.
 */

import { generateIIIFManifest } from "../exportIIIF";
import { generateHtmlExport } from "../exportHtml";
import type { FourCornersMetadataExtended } from "../field-registry";
import {
  resolveAssets,
  estimateExportSize,
  defaultAssetDeps,
  type AssetResolutionDeps,
} from "./assets";
import { buildExportMetadata, blobToDataUrl } from "./serialize";
import { buildStandaloneHtml, buildIndexHtml, type ExportEnvelope } from "./html";
import { buildReadme } from "./readme";
import { buildZipBundle } from "./zip";
import {
  JSON_EXPORT_WARN_BYTES,
  STANDALONE_IN_ZIP_MAX_BYTES,
  sanitizeExportFilename,
  type AssetRef,
  type ExportOptions,
  type ExportProgress,
  type ExportProjectInput,
  type ExportResult,
  type ExportSummary,
} from "./types";
import { formatBytes } from "../upload-limits";

function buildSummary(assets: AssetRef[], extraWarnings: string[]): ExportSummary {
  return {
    assets: assets.map((a) => ({
      refId: a.refId,
      kind: a.kind,
      filename: a.filename,
      status: a.status,
      origin: a.origin,
      warning: a.warning,
      bytes: a.bytes?.size,
    })),
    warnings: [
      ...assets.flatMap((a) => (a.warning ? [a.warning] : [])),
      ...extraWarnings,
    ],
    totalBytes: estimateExportSize(assets, "zip"),
  };
}

/** Apply the location/EXIF toggles once, for every consumer (IIIF, snippet). */
function applyToggles(
  metadata: FourCornersMetadataExtended,
  options: ExportOptions,
): FourCornersMetadataExtended {
  return {
    ...metadata,
    location: options.excludeLocation ? undefined : metadata.location,
    photoMetadata: options.includeExif ? metadata.photoMetadata : undefined,
  };
}

export async function runExport(
  input: ExportProjectInput,
  options: ExportOptions,
  onProgress?: (progress: ExportProgress) => void,
  deps: AssetResolutionDeps = defaultAssetDeps(),
): Promise<ExportResult> {
  const warnings: string[] = [];
  const filenameBase = sanitizeExportFilename(input.title);

  // Metadata-only fast path: JSON without embedded binaries needs no asset
  // resolution at all.
  const metadataOnly = options.format === "json" && !options.embedImages;

  let assets: AssetRef[] = [];
  if (!metadataOnly) {
    onProgress?.({ stage: "assets", message: "Collecting media…" });
    assets = await resolveAssets(
      input,
      options,
      (current, total, label) =>
        onProgress?.({
          stage: "assets",
          message: `Collecting media: ${label}`,
          current,
          total,
        }),
      deps,
    );
  }

  onProgress?.({ stage: "serialize", message: "Serializing metadata…" });

  if (options.format === "json") {
    const envelope = await buildExportMetadata(
      input,
      options,
      assets,
      options.embedImages ? "embedded" : "reference",
    );
    const rawSize = estimateExportSize(assets, "zip");
    if (options.embedImages && rawSize >= JSON_EXPORT_WARN_BYTES) {
      warnings.push(
        `Embedded JSON is ~${formatBytes(Math.round(rawSize * 1.33))} — larger than the 50 MB import cap allows. Use the ZIP bundle instead.`,
      );
    }
    const json = JSON.stringify(envelope, null, 2);
    onProgress?.({ stage: "done", message: "Done" });
    return {
      blob: new Blob([json], { type: "application/json" }),
      filename: `${filenameBase}.json`,
      mimeType: "application/json",
      summary: buildSummary(assets, warnings),
    };
  }

  if (options.format === "html-standalone") {
    const envelope = (await buildExportMetadata(
      input,
      options,
      assets,
      "embedded",
    )) as unknown as ExportEnvelope;
    onProgress?.({ stage: "html", message: "Building standalone HTML…" });
    const html = buildStandaloneHtml(envelope);
    onProgress?.({ stage: "done", message: "Done" });
    return {
      blob: new Blob([html], { type: "text/html" }),
      filename: `${filenameBase}.html`,
      mimeType: "text/html",
      summary: buildSummary(assets, warnings),
    };
  }

  if (options.format === "html-snippet") {
    // CDN snippet mode stays with lib/exportHtml — reference-flavor
    // metadata, main image embedded when we have bytes.
    const mainAsset = assets.find(
      (a) => a.refId === "main" && a.kind === "main-image" && a.status === "resolved",
    );
    const imageSrc = mainAsset?.bytes
      ? await blobToDataUrl(mainAsset.bytes)
      : input.mainImage.src || "";
    onProgress?.({ stage: "html", message: "Building embed snippet…" });
    const html = generateHtmlExport(
      applyToggles(input.metadata, options),
      imageSrc,
      { mode: "snippet", imageSource: "embed", includeRawMetadata: true },
    );
    onProgress?.({ stage: "done", message: "Done" });
    return {
      blob: new Blob([html], { type: "text/html" }),
      filename: `${filenameBase}-embed.html`,
      mimeType: "text/html",
      summary: buildSummary(assets, warnings),
    };
  }

  // ── ZIP bundle (canonical 1:1 artifact) ──
  const bundleEnvelope = (await buildExportMetadata(
    input,
    options,
    assets,
    "bundle-relative",
  )) as unknown as ExportEnvelope;

  onProgress?.({ stage: "html", message: "Building viewers…" });
  const indexHtml = buildIndexHtml(bundleEnvelope);

  let standaloneHtml: string | undefined;
  const standaloneEstimate = estimateExportSize(assets, "standalone");
  if (options.includeStandaloneInZip !== false) {
    if (standaloneEstimate <= STANDALONE_IN_ZIP_MAX_BYTES) {
      const embeddedEnvelope = (await buildExportMetadata(
        input,
        { ...options, embedImages: true },
        assets,
        "embedded",
      )) as unknown as ExportEnvelope;
      standaloneHtml = buildStandaloneHtml(embeddedEnvelope);
    } else {
      warnings.push(
        `standalone.html skipped — embedded estimate ${formatBytes(standaloneEstimate)} exceeds ${formatBytes(STANDALONE_IN_ZIP_MAX_BYTES)}`,
      );
    }
  }

  const mainAsset = assets.find(
    (a) => a.refId === "main" && a.kind === "main-image" && a.status === "resolved",
  );
  const iiifManifest = generateIIIFManifest(
    applyToggles(input.metadata, options),
    mainAsset?.filename || "image.jpg",
    input.projectId ? `urn:uuid:${input.projectId}` : undefined,
  );

  onProgress?.({ stage: "zip", message: "Packing ZIP…" });
  const blob = await buildZipBundle({
    assets,
    metadataJson: JSON.stringify(bundleEnvelope, null, 2),
    iiifManifestJson: JSON.stringify(iiifManifest, null, 2),
    indexHtml,
    standaloneHtml,
    readme: buildReadme(
      applyToggles(input.metadata, options),
      assets,
      standaloneHtml !== undefined,
    ),
  });

  onProgress?.({ stage: "done", message: "Done" });
  return {
    blob,
    filename: `${filenameBase}-export.zip`,
    mimeType: "application/zip",
    summary: buildSummary(assets, warnings),
  };
}
