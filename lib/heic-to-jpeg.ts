/**
 * Client-side HEIC → JPEG conversion for upload flows.
 *
 * Browsers other than Safari cannot decode HEIC natively, so iPhone uploads
 * end up unrenderable. We intercept HEIC files at the earliest upload entry
 * point and transparently convert to JPEG so the rest of the pipeline
 * (thumbnailing, IndexedDB cache, Supabase upload) sees a standard image.
 *
 * The decoder (`heic2any`, ~1MB WASM) is dynamically imported only when an
 * HEIC file is actually detected, so non-iPhone users pay zero bundle cost.
 *
 * Usage:
 *   const processedFile = await maybeConvertHeic(file);
 *
 * If `file` is not HEIC, it is returned untouched.
 * If conversion throws, the ORIGINAL file is returned with a console warning
 * so that upload can still proceed in whatever degraded state the caller
 * already handles (consistent with previous behaviour).
 */

/** Matches both MIME type and filename extension (iOS sometimes sends octet-stream). */
export function isHeicFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  if (mime === "image/heic" || mime === "image/heif") return true;
  if (mime === "image/heic-sequence" || mime === "image/heif-sequence") return true;
  return /\.(heic|heif)$/i.test(file.name);
}

/**
 * If `file` is HEIC/HEIF, convert to JPEG and return a new File with:
 *   - `.jpg` extension (original basename preserved)
 *   - `image/jpeg` MIME type
 *   - same `lastModified` (date heuristics depend on it)
 *
 * Otherwise return `file` unchanged.
 */
export async function maybeConvertHeic(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  try {
    // Dynamic import — keeps heic2any out of the main bundle
    const { default: heic2any } = await import("heic2any");

    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });

    // heic2any returns Blob | Blob[] (array when HEIC contains multiple images);
    // we take the first for single-image display.
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;

    const jpegName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([jpegBlob], jpegName, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch (err) {
    console.warn("HEIC conversion failed, passing original through:", err);
    return file;
  }
}
