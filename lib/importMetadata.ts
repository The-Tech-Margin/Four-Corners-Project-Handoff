/**
 * METADATA IMPORT V2
 *
 * Zod-based validation with comprehensive error reporting.
 * Uses field registry for automatic validation and transformation.
 */

import { FourCornersMetadataExtendedSchema } from "./field-registry";
import type { ContextItem, FourCornersMetadataExtended } from "./field-registry";
import { FIELD_INDEX } from "./field-registry";
import { hasFieldValue } from "./field-utils";
import { checkExportVersion, CURRENT_EXPORT_VERSION } from "./export-contract";
import { IMPORT_ZIP_MAX_BYTES, formatBytes } from "./upload-limits";


export interface ImportResult {
  success: boolean;
  data?: FourCornersMetadataExtended;
  mainImage?: string; // Main photograph as base64 data URL
  error?: string;
  warnings?: string[];
}

/**
 * Normalize a schema-validated imported context item. Spread-based so new
 * schema fields survive import automatically — never rebuild items from a
 * hand-listed subset of fields.
 */
export function normalizeImportedContextItem(item: ContextItem): ContextItem {
  return {
    ...item,
    id: item.id || crypto.randomUUID(),
    src: item.src || item.url || undefined,
    url: item.url || item.src || undefined,
  };
}

/**
 * Regenerate client ids on imported metadata. Imported ids are the
 * EXPORTER'S client UUIDs, and `syncContextItems` inserts client ids as
 * `context_items` primary keys — re-importing into the same account then
 * collides with the original project's rows (23505 → HTTP 409) and the save
 * fails. ZIP import regenerates inside `applyBundleToMetadata`; every other
 * import path must apply this before the metadata reaches the store.
 * `linkedProjectId`/`linkedProjectSlug` are project references, not row
 * identity — kept verbatim.
 */
export function regenerateImportedIds(
  metadata: FourCornersMetadataExtended,
): FourCornersMetadataExtended {
  return {
    ...metadata,
    context: (metadata.context || []).map((item) => ({
      ...item,
      id: crypto.randomUUID(),
    })),
    voiceTranscriptions: metadata.voiceTranscriptions?.map((vt) => ({
      ...vt,
      id: crypto.randomUUID(),
      recordingId: crypto.randomUUID(),
    })),
  };
}

/**
 * Parse and validate metadata JSON text using the Zod schema.
 * Handles both standard Four Corners and extended (`_ext`) format.
 */
export function parseMetadataText(text: string): ImportResult {
  try {
    const json = JSON.parse(text);

    const warnings: string[] = [];

    // Read the export version from the raw JSON — Zod strip-parse deletes
    // unknown keys like _ext.export below.
    const exportVersion =
      json._ext?.export?.version ??
      json._ext?.meta?.editorVersion ??
      json.meta?.editorVersion;
    const versionCheck = checkExportVersion(exportVersion);
    if (versionCheck.warning) {
      warnings.push(versionCheck.warning);
    }

    // Handle _ext format (our export format)
    let rawData = json;
    let mainImage: string | undefined;
    if (json._ext) {
      mainImage = json._ext.mainImage; // Extract main image
      rawData = {
        backStory: json.backStory,
        context: json.context,
        links: json.links,
        creativeCommons: json.creativeCommons,
        ...json._ext,
      };
      delete rawData.mainImage; // Remove from metadata object
    }

    // Validate with Zod schema (partial validation for flexibility)
    const result = FourCornersMetadataExtendedSchema.partial({
      ethics: true,
      photographerInfo: true,
      location: true,
      photoMetadata: true,
      voiceTranscriptions: true,
      meta: true,
    }).safeParse(rawData);

    if (!result.success) {
      // Format Zod errors
      const errors = result.error.errors.map((err) => {
        const path = err.path.join(".");
        return `${path}: ${err.message}`;
      });

      return {
        success: false,
        error: `Validation failed:\n${errors.join("\n")}`,
      };
    }

    const metadata = result.data as FourCornersMetadataExtended;

    // Ensure context items have proper structure
    if (metadata.context) {
      metadata.context = metadata.context.map(normalizeImportedContextItem);
    }

    // Check for embedded images
    const embeddedCount =
      metadata.context?.filter((item) => item.src?.startsWith("data:"))
        .length || 0;

    const urlCount =
      metadata.context?.filter(
        (item) => item.src && !item.src.startsWith("data:")
      ).length || 0;

    if (embeddedCount > 0) {
      warnings.push(
        `${embeddedCount} context image(s) have embedded data - these will be preserved`
      );
    }
    if (urlCount > 0) {
      warnings.push(
        `${urlCount} context image(s) reference external URLs - ensure these are accessible`
      );
    }

    // Check for empty required fields
    if (!metadata.backStory?.text && !metadata.backStory?.author) {
      warnings.push("BackStory appears to be empty");
    }

    // Set default meta if not present
    if (!metadata.meta) {
      metadata.meta = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editorVersion: CURRENT_EXPORT_VERSION,
        mode: "complete",
      };
    }

    return {
      success: true,
      data: metadata,
      mainImage: mainImage, // Include main image for import dialog to restore
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: "Invalid JSON format: " + error.message,
      };
    }
    return {
      success: false,
      error: "Failed to parse file: " + (error as Error).message,
    };
  }
}

/**
 * Parse and validate a metadata.json File
 */
export async function parseMetadataJson(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    return parseMetadataText(text);
  } catch (error) {
    return {
      success: false,
      error: "Failed to read file: " + (error as Error).message,
    };
  }
}

/**
 * Process embedded context images for import
 * Converts base64 data URLs to IndexedDB blobs
 */
export async function processEmbeddedContextImages(
  context: FourCornersMetadataExtended["context"]
): Promise<FourCornersMetadataExtended["context"]> {
  if (!context || context.length === 0) return context;

  const { mediaStorage } = await import("./media-storage");

  const processedContext = await Promise.all(
    context.map(async (item) => {
      // Only process embedded base64 images
      if (item.src && item.src.startsWith("data:")) {
        try {
          // Convert data URL to Blob
          const response = await fetch(item.src);
          const blob = await response.blob();

          // Store in IndexedDB
          const blobId = await mediaStorage.save(
            blob,
            item.filename || `imported-${Date.now()}.jpg`
          );

          // Generate thumbnail
          const thumbnailDataUrl = await generateThumbnail(item.src, 200);

          return {
            ...item,
            id: item.id || crypto.randomUUID(),
            sourceType: "upload" as const,
            blobId,
            thumbnailDataUrl,
            filename: item.filename || `imported-${Date.now()}.jpg`,
            mimeType: item.mimeType || blob.type || "image/jpeg",
          };
        } catch (error) {
          console.error("Failed to process embedded image:", error);
          return item;
        }
      }

      // Return URL-based items as-is
      return {
        ...item,
        id: item.id || crypto.randomUUID(),
        sourceType: item.sourceType || ("url" as const),
      };
    })
  );

  return processedContext;
}

/**
 * Generate thumbnail from data URL
 */
async function generateThumbnail(
  dataUrl: string,
  maxSize: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

// Text-based imports (.json, .html) hold everything base64-inflated in one
// string — capped lower than ZIP bundles, which stream per-entry.
const IMPORT_TEXT_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Validate file before import
 */
export function validateImportFile(file: File): {
  valid: boolean;
  error?: string;
} {
  const name = file.name.toLowerCase();
  const maxBytes = name.endsWith(".zip")
    ? IMPORT_ZIP_MAX_BYTES
    : name.endsWith(".json") || name.endsWith(".html")
      ? IMPORT_TEXT_MAX_BYTES
      : null;

  if (maxBytes === null) {
    return {
      valid: false,
      error: "Only .json, .zip, and .html files are supported",
    };
  }

  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds ${formatBytes(maxBytes)} limit (${formatBytes(file.size)})`,
    };
  }

  return { valid: true };
}

/**
 * Validate metadata completeness (registry-based)
 */
export function validateMetadataCompleteness(
  metadata: FourCornersMetadataExtended
): { complete: boolean; missingRequired: string[] } {
  const missingRequired: string[] = [];

  // Get all required fields from registry
  const allFields = FIELD_INDEX.getAllWithIIIF();

  for (const field of allFields) {
    if (field.required) {
      if (!hasFieldValue(metadata, field.path)) {
        missingRequired.push(field.label);
      }
    }
  }

  return {
    complete: missingRequired.length === 0,
    missingRequired,
  };
}
