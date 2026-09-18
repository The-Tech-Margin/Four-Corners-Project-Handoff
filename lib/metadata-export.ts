/**
 * Metadata Export Utilities
 * Download/copy Four Corners metadata and IIIF manifests for a project.
 *
 * JSON goes through the shared export engine over a full `getProject(id)`
 * record (normalized-table reconstruction) — list rows carry only partial
 * metadata and must never be the export source. Falls back to the passed
 * record when the fetch fails (public viewers without row access).
 */

import { generateIIIFManifest } from "./exportIIIF";
import type { FourCornersMetadataExtended } from "./field-registry";
import { getProject } from "./api-client/project-actions";
import type { ProjectRecord } from "./projects/types";
import { normalizeFromProjectRecord } from "./export/normalize";
import { startExport } from "./export/client";
import type { ExportOptions } from "./export/types";

const JSON_EXPORT_OPTIONS: ExportOptions = {
  format: "json",
  embedImages: false, // metadata-only fast path — media stays as URLs
  excludeLocation: false,
  includeExif: true,
  includeConsentDocs: false,
};

async function resolveFullProject(project: ProjectRecord): Promise<ProjectRecord> {
  return (await getProject(project.id)) ?? project;
}

async function buildProjectJSON(project: ProjectRecord): Promise<{
  json: string;
  filename: string;
}> {
  const full = await resolveFullProject(project);
  const result = await startExport(
    normalizeFromProjectRecord(full),
    JSON_EXPORT_OPTIONS,
  ).promise;
  return { json: await result.blob.text(), filename: result.filename };
}

function triggerDownload(content: Blob, filename: string): void {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download Four Corners JSON metadata for a project
 */
export async function downloadFourCornersJSON(
  project: ProjectRecord,
): Promise<void> {
  const { json, filename } = await buildProjectJSON(project);
  triggerDownload(new Blob([json], { type: "application/json" }), filename);
}

/**
 * Copy Four Corners JSON to clipboard
 */
export async function copyFourCornersJSON(
  project: ProjectRecord,
): Promise<boolean> {
  try {
    const { json } = await buildProjectJSON(project);
    await navigator.clipboard.writeText(json);
    return true;
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    return false;
  }
}

/**
 * Download IIIF manifest for a project
 */
export function downloadIIIFManifest(
  project: ProjectRecord,
  imageFilename?: string,
): void {
  const metadata = project.metadata as FourCornersMetadataExtended;
  const manifestId = `urn:uuid:${project.id}`;
  const imgFilename = imageFilename || "image.jpg";

  const manifest = generateIIIFManifest(metadata, imgFilename, manifestId);
  const json = JSON.stringify(manifest, null, 2);

  const filename = sanitizeFilename(
    project.title || project.slug || "iiif-manifest",
  );
  triggerDownload(new Blob([json], { type: "application/json" }), `${filename}-iiif.json`);
}

/**
 * Copy IIIF manifest to clipboard
 */
export async function copyIIIFManifest(
  project: ProjectRecord,
  imageFilename?: string,
): Promise<boolean> {
  try {
    const metadata = project.metadata as FourCornersMetadataExtended;
    const manifestId = `urn:uuid:${project.id}`;
    const imgFilename = imageFilename || "image.jpg";

    const manifest = generateIIIFManifest(metadata, imgFilename, manifestId);
    const json = JSON.stringify(manifest, null, 2);
    await navigator.clipboard.writeText(json);
    return true;
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    return false;
  }
}

/**
 * Sanitize filename for download
 */
function sanitizeFilename(name: string): string {
  return name
    .slice(0, 50)
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
