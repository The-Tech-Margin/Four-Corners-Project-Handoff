/**
 * Issue intake — one-click DOM screenshot.
 *
 * Rasterizes the current page (document.body) to a downscaled WebP data URL
 * using `modern-screenshot`. Nodes marked `.fc-redact` or `[data-fc-private]`
 * are masked before capture so consent docs / sensitive in-progress work
 * never leave the device. On any failure (capture error, cross-origin canvas
 * taint) the caller falls back to a manual file attach.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { domToCanvas } from "modern-screenshot";

const MAX_LONG_EDGE = 1600;
const WEBP_QUALITY = 0.8;
const REDACT_SELECTOR = ".fc-redact, [data-fc-private]";

export interface ScreenshotResult {
  ok: boolean;
  /** WebP data URL when ok; undefined otherwise. */
  dataUrl?: string;
  error?: string;
}

/**
 * Capture the page as a WebP data URL. Returns `{ ok: false }` on any
 * failure so the UI can offer a manual attach instead of throwing.
 *
 * The element to ignore in the capture (e.g. the reporter modal/button) can
 * be passed so the screenshot reflects the underlying page, not our own UI.
 */
export async function captureScreenshot(
  ignore?: HTMLElement | null,
): Promise<ScreenshotResult> {
  if (typeof document === "undefined") {
    return { ok: false, error: "No document" };
  }

  try {
    const canvas = await domToCanvas(document.body, {
      // Mask sensitive nodes and skip our own reporter UI.
      filter: (node) => {
        if (!(node instanceof Element)) return true;
        if (ignore && (node === ignore || ignore.contains(node))) return false;
        if (node.matches?.(REDACT_SELECTOR)) return false;
        return true;
      },
      backgroundColor:
        getComputedStyle(document.documentElement).getPropertyValue(
          "--fc-bg",
        ) || "#0a0a0a",
    });

    const downscaled = downscaleCanvas(canvas, MAX_LONG_EDGE);

    // toDataURL throws a SecurityError if the canvas is tainted by a
    // cross-origin asset — treat that as a clean capture failure.
    const dataUrl = downscaled.toDataURL("image/webp", WEBP_QUALITY);
    if (!dataUrl.startsWith("data:image/webp")) {
      return { ok: false, error: "WebP not supported" };
    }
    return { ok: true, dataUrl };
  } catch (err) {
    // Surfaced for diagnostics; the caller falls back to manual attach.
    console.warn("[issue-reporter] screenshot capture failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Capture failed",
    };
  }
}

/** Scale a canvas down so its longest edge is at most `maxLongEdge` px. */
function downscaleCanvas(
  source: HTMLCanvasElement,
  maxLongEdge: number,
): HTMLCanvasElement {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxLongEdge) return source;

  const scale = maxLongEdge / longest;
  const target = document.createElement("canvas");
  target.width = Math.round(source.width * scale);
  target.height = Math.round(source.height * scale);
  const ctx = target.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, target.width, target.height);
  return target;
}

/** Read a user-attached image File into a WebP-or-original data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
