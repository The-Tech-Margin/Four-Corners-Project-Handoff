/**
 * HTML export import — pull the embedded metadata JSON back out of any
 * Four Corners HTML artifact. Regex-based (node-testable, no DOM):
 *
 * - `#fc-metadata` script — self-contained viewer (standalone.html,
 *   index.html, engine standalone exports)
 * - `data-4c-meta` script — CDN snippet / legacy standalone
 *
 * Both payloads are the export envelope, which parseMetadataText's `_ext`
 * branch already handles.
 */

export interface HtmlExtraction {
  metadataText: string | null;
  /** First embedded data: image — fallback when `_ext.mainImage` is absent. */
  mainImage?: string;
}

export function extractMetadataFromHtml(html: string): HtmlExtraction {
  const fcMetadata = html.match(
    /<script[^>]*id=["']fc-metadata["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  const data4c = html.match(
    /<script[^>]*data-4c-meta[^>]*>([\s\S]*?)<\/script>/i,
  );
  const metadataText = (fcMetadata?.[1] ?? data4c?.[1])?.trim() || null;

  const imgMatch = html.match(/<img[^>]+src=["'](data:image\/[^"']+)["']/i);

  return {
    metadataText,
    mainImage: imgMatch?.[1],
  };
}
