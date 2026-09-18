/**
 * Shared media type detection utilities.
 *
 * Used across editor preview, viewer, gallery cards, and explore mode
 * to conditionally render <video> vs <img> elements.
 */

/**
 * Detect video from a URL or data URL.
 *
 * Two paths matter:
 *  - Storage URLs end in a real extension (.mp4 / .webm / .mov / …) and
 *    optionally carry a query string.
 *  - In the editor, before save, `imageSrc` is a `data:video/<subtype>;base64,…`
 *    URL produced by FileReader.readAsDataURL. The extension check misses
 *    those, which is what made the preview render <img> for a freshly-picked
 *    video and show a broken-image icon.
 *
 * Extension list mirrors ALLOWED_VIDEO_MIME_TYPES so anything we accept on
 * upload also renders as <video> in the preview, gallery, and viewer.
 */
export function isVideoUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url.startsWith("data:video/")) return true;
  return /\.(mp4|webm|ogg|ogv|mov|m4v|3gp|3g2|mkv|avi|mpeg|mpg|ts|m2ts|wmv|flv|hevc)(\?|$)/i.test(url);
}
