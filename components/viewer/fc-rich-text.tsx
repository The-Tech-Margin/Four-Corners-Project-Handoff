"use client";

import { useMemo } from "react";
import { LinkCard } from "./fc-panel-links";

interface FCRichTextProps {
  text: string;
  className?: string;
}

/** URL regex — matches http/https URLs in plain text */
const URL_RE = /https?:\/\/[^\s)\]}>,"']+/g;

/**
 * Renders text with embedded URLs as LinkCard previews.
 * Plain text segments render as <span>, URLs render as OG-enriched cards.
 * Reuses the existing LinkCard component from fc-panel-links.
 */
export function FCRichText({ text, className }: FCRichTextProps) {
  const segments = useMemo(() => {
    const parts: { type: "text" | "url"; value: string }[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(URL_RE)) {
      const url = match[0];
      const start = match.index!;

      // Text before this URL
      if (start > lastIndex) {
        parts.push({ type: "text", value: text.slice(lastIndex, start) });
      }

      // Strip trailing punctuation that's likely not part of the URL
      const cleaned = url.replace(/[.,;:!?)}\]]+$/, "");
      parts.push({ type: "url", value: cleaned });
      lastIndex = start + cleaned.length;
    }

    // Remaining text after last URL
    if (lastIndex < text.length) {
      parts.push({ type: "text", value: text.slice(lastIndex) });
    }

    return parts;
  }, [text]);

  // No URLs found — render as plain text
  const hasUrls = segments.some((s) => s.type === "url");
  if (!hasUrls) {
    return <p className={className}>{text}</p>;
  }

  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <div key={i} style={{ margin: "8px 0" }}>
            <LinkCard link={{ title: "", url: seg.value, source: "" }} />
          </div>
        ),
      )}
    </div>
  );
}
