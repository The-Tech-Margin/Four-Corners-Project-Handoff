"use client";

import { useState, useEffect, useCallback } from "react";
import { ExternalLink } from "lucide-react";
import type { Link } from "@/lib/field-registry";
import type { LinkPreviewData } from "@/app/api/link-preview/route";
import { FCLinkOverlay } from "./fc-link-overlay";

export interface FCPanelLinksProps {
  data: Link[];
}

/**
 * Extract hostname from URL for display
 */
function extractHostname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** In-memory cache so navigating away and back doesn't re-fetch */
const previewCache = new Map<string, LinkPreviewData>();

/** Get cached preview for a URL (used by overlay) */
export function getCachedPreview(url: string): LinkPreviewData | null {
  return previewCache.get(url) ?? null;
}

/**
 * Single link card that fetches OG preview data on mount.
 * Shows the user-provided title/source immediately, then enriches
 * with OG image, description, and site name when available.
 */
export function LinkCard({
  link,
  onSelect,
}: {
  link: Link;
  onSelect?: (link: Link, preview: LinkPreviewData | null) => void;
}) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(
    link.url ? previewCache.get(link.url) ?? null : null,
  );
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!link.url || previewCache.has(link.url)) return;

    const controller = new AbortController();
    fetch(`/api/link-preview?url=${encodeURIComponent(link.url)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LinkPreviewData | null) => {
        if (data) {
          previewCache.set(link.url!, data);
          setPreview(data);
        }
      })
      .catch(() => {
        /* network error or abort — keep showing basic card */
      });

    return () => controller.abort();
  }, [link.url]);

  const displayTitle =
    link.title || preview?.title || extractHostname(link.url || "");
  const description = preview?.description;
  const image = !imgError ? preview?.image : undefined;
  const favicon = preview?.favicon;
  const siteName = link.source || preview?.siteName;
  const domain = link.url ? extractHostname(link.url) : undefined;

  const handleClick = useCallback(() => {
    if (onSelect) {
      onSelect(link, preview);
    } else if (link.url) {
      window.open(link.url, "_blank", "noopener");
    }
  }, [link, preview, onSelect]);

  const handleExternalClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Let the anchor tag handle navigation naturally
    },
    [],
  );

  return (
    <div
      className="fc-link-item"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* OG image preview */}
      {image && (
        <div className="fc-link-preview-image">
          <img
            src={image}
            alt=""
            decoding="async"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      <div className="fc-link-content">
        <div className="fc-link-header">
          {favicon && (
            <img
              src={favicon}
              alt=""
              className="fc-link-favicon"
              width={16}
              height={16}
            />
          )}
          <span className="fc-link-title">{displayTitle}</span>
        </div>

        {description && (
          <span className="fc-link-description">
            {description.length > 120
              ? `${description.slice(0, 120)}...`
              : description}
          </span>
        )}

        <div className="fc-link-footer">
          {siteName && <span className="fc-link-source">{siteName}</span>}
          {siteName && domain && <span className="fc-link-dot">&middot;</span>}
          {domain && <span className="fc-link-domain">{domain}</span>}
        </div>

        {/* Direct-to-browser escape hatch */}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="fc-link-icon"
          onClick={handleExternalClick}
          aria-label={`Open ${displayTitle} in new tab`}
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

/**
 * Links panel content (bottom-right corner).
 * Maps to fourcorners.js "Links" which contains:
 * - External resources
 * - Fact-checking links
 * - Related articles
 */
export function FCPanelLinks({ data }: FCPanelLinksProps) {
  const [selectedLink, setSelectedLink] = useState<{
    link: Link;
    preview: LinkPreviewData | null;
  } | null>(null);

  const handleSelect = useCallback(
    (link: Link, preview: LinkPreviewData | null) => {
      setSelectedLink({ link, preview });
    },
    [],
  );

  const handleClose = useCallback(() => {
    setSelectedLink(null);
  }, []);

  if (data.length === 0) {
    return <p className="fc-panel__empty">No links available.</p>;
  }

  return (
    <>
      <div className="space-y-3">
        {data.map((link, index) => (
          <LinkCard key={index} link={link} onSelect={handleSelect} />
        ))}
      </div>

      <FCLinkOverlay
        link={selectedLink?.link ?? { title: "", url: "", source: "" }}
        preview={selectedLink?.preview ?? null}
        isOpen={selectedLink !== null}
        onClose={handleClose}
      />
    </>
  );
}
