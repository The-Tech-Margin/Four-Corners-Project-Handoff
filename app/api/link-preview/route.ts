import { NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/attribution";
import { BlockedUrlError, safeGet } from "@/lib/server/safe-fetch";

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  /** Whether the target site allows being embedded in an iframe */
  frameable?: boolean;
  /** Embed-friendly URL for video platforms (YouTube, Vimeo, etc.) */
  embedUrl?: string;
}

/** Extract content from a meta tag match */
function getMetaContent(html: string, property: string): string | undefined {
  // Match both property="..." and name="..." variants
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*?)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*?)["'][^>]+(?:property|name)=["']${property}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

/** Extract <title> tag content */
function getTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() || undefined;
}

/** Resolve a potentially relative URL against a base */
function resolveUrl(base: string, path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("//")) return `https:${path}`;
  try {
    return new URL(path, base).href;
  } catch {
    return undefined;
  }
}

/** Build favicon URL — try common paths */
function getFavicon(html: string, baseUrl: string): string | undefined {
  // Check for explicit icon link tags
  const iconPatterns = [
    /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']*?)["']/i,
    /<link[^>]+href=["']([^"']*?)["'][^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i,
  ];

  for (const pattern of iconPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) return resolveUrl(baseUrl, match[1]);
  }

  // No third-party favicon service: the site's own default location or nothing.
  try {
    return new URL("/favicon.ico", baseUrl).toString();
  } catch {
    return undefined;
  }
}

/**
 * Check response headers to determine if a site can be embedded in an iframe.
 *
 * These are always third-party links — our domain will never appear in
 * anyone's allow-list. So any framing restriction blocks us:
 * - X-Frame-Options (any value) → blocked
 * - CSP frame-ancestors (unless it includes * or https:) → blocked
 * - No framing headers → allowed
 */
function checkFrameable(headers: Headers): boolean {
  // Any X-Frame-Options header blocks third-party embedding
  if (headers.get("x-frame-options")) return false;

  // Check both enforced and report-only CSP
  for (const name of ["content-security-policy", "content-security-policy-report-only"]) {
    const csp = headers.get(name) || "";
    const fa = csp.match(/frame-ancestors\s+([^;]+)/i);
    if (fa) {
      const sources = fa[1].trim().toLowerCase();
      // Only * or https: scheme-source allows arbitrary third parties
      if (sources.includes("*") || sources.includes("https:")) return true;
      // Everything else ('none', 'self', specific domains) blocks us
      return false;
    }
  }

  return true;
}

/**
 * Convert a video platform URL to its embed-friendly equivalent.
 * Returns null for non-video or unrecognized URLs.
 */
function getEmbedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");

  // YouTube: watch, shorts, and youtu.be short links
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = parsed.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}`;
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;
    // Already an embed URL
    if (parsed.pathname.startsWith("/embed/")) return url;
  }
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1);
    if (id) return `https://www.youtube.com/embed/${id}`;
  }

  // Vimeo
  if (host === "vimeo.com") {
    const match = parsed.pathname.match(/^\/(\d+)/);
    if (match) return `https://player.vimeo.com/video/${match[1]}`;
  }
  if (host === "player.vimeo.com") return url; // already embed

  // Dailymotion
  if (host === "dailymotion.com") {
    const match = parsed.pathname.match(/^\/video\/([a-zA-Z0-9]+)/);
    if (match) return `https://www.dailymotion.com/embed/video/${match[1]}`;
  }
  if (host === "dai.ly") {
    const id = parsed.pathname.slice(1);
    if (id) return `https://www.dailymotion.com/embed/video/${id}`;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Invalid URL protocol" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const response = await safeGet(url, undefined, {
      headers: {
        "User-Agent": `FourCornersBot/1.0 (+${siteUrl()})`,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const isHtml =
      contentType.includes("text/html") || contentType.includes("application/xhtml");

    if (response.status >= 400 || !isHtml) {
      return NextResponse.json(
        { url, title: undefined, description: undefined } satisfies LinkPreviewData,
        {
          status: 200,
          headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
        },
      );
    }

    const html = response.body;

    const data: LinkPreviewData = {
      url: response.finalUrl,
      title:
        getMetaContent(html, "og:title") ??
        getMetaContent(html, "twitter:title") ??
        getTitle(html),
      description:
        getMetaContent(html, "og:description") ??
        getMetaContent(html, "twitter:description") ??
        getMetaContent(html, "description"),
      image: resolveUrl(
        response.finalUrl,
        getMetaContent(html, "og:image") ?? getMetaContent(html, "twitter:image"),
      ),
      favicon: getFavicon(html, response.finalUrl),
      siteName:
        getMetaContent(html, "og:site_name") ??
        getMetaContent(html, "application-name"),
      frameable: checkFrameable(response.headers),
    };

    // Video platforms: convert to embed URL and force frameable
    const embedUrl = getEmbedUrl(url);
    if (embedUrl) {
      data.embedUrl = embedUrl;
      data.frameable = true;
    }

    // Secondary check: some sites set framing restrictions via <meta> tags
    // rather than (or in addition to) HTTP headers.
    // Skip for video embeds — we use their dedicated embed URL, not the page.
    if (data.frameable && !data.embedUrl) {
      // <meta http-equiv="X-Frame-Options" content="...">
      const metaXFO = html.match(
        /<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]+content=["']([^"']+)["']/i,
      );
      if (metaXFO) data.frameable = false;

      // <meta http-equiv="Content-Security-Policy" content="frame-ancestors ...">
      const metaCSP = html.match(
        /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content=["']([^"']+)["']/i,
      );
      if (metaCSP) {
        const fa = metaCSP[1].match(/frame-ancestors\s+([^;]+)/i);
        if (fa && !fa[1].includes("*")) data.frameable = false;
      }
    }

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    });
  } catch (err) {
    if (err instanceof BlockedUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Timeout or network error — return partial data rather than failing
    return NextResponse.json(
      { url } satisfies LinkPreviewData,
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
      },
    );
  }
}
