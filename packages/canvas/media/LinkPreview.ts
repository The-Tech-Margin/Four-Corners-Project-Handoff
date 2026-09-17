/**
 * @module media/LinkPreview
 * URL metadata fetcher for Open Graph preview data.
 */

/** Metadata extracted from a URL for link card display. */
export interface LinkPreviewData {
  /** The original URL. */
  url: string;
  /** Page title from Open Graph or <title>. */
  title?: string;
  /** Page description from Open Graph or meta description. */
  description?: string;
  /** Open Graph image URL. */
  image?: string;
  /** Favicon URL. */
  favicon?: string;
  /** Domain name extracted from the URL. */
  domain: string;
}

/**
 * Fetches link preview metadata.
 * If an apiEndpoint is provided, delegates to a server-side route
 * (e.g. the consuming app's /api/link-preview). Otherwise, extracts
 * basic info from the URL string itself.
 */
export class LinkPreview {
  /**
   * Fetch preview metadata for a URL.
   * @param url - The URL to preview.
   * @param apiEndpoint - Optional server endpoint for OG fetching.
   * @returns Link preview data.
   */
  static async fetch(url: string, apiEndpoint?: string): Promise<LinkPreviewData> {
    const domain = LinkPreview.extractDomain(url);

    if (apiEndpoint) {
      try {
        const response = await globalThis.fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            url,
            domain,
            title: data.title,
            description: data.description,
            image: data.image,
            favicon: data.favicon,
          };
        }
      } catch {
        // Fall through to basic preview
      }
    }

    // Basic preview from URL string only
    return {
      url,
      domain,
      favicon: `https://${domain}/favicon.ico`,
    };
  }

  /**
   * Extract the domain name from a URL string.
   * @param url - The URL to parse.
   * @returns The hostname (domain).
   */
  private static extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      // Fallback: strip protocol and path
      return url
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/:\d+$/, '');
    }
  }
}
