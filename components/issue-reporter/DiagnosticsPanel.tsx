/**
 * DiagnosticsPanel — "see exactly what's included" expander.
 *
 * Shows the captured context payload back to the user before they submit, so
 * the auto-capture is transparent. Read-only.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useState } from "react";
import type { CapturedContext } from "@/lib/issue-capture";

export function DiagnosticsPanel({ context }: { context: CapturedContext }) {
  const [expanded, setExpanded] = useState(false);

  const payload = {
    app_state: context.app_state,
    device: context.device,
    diagnostics: context.diagnostics,
    url: context.url,
    route: context.route,
    referrer: context.referrer,
  };

  return (
    <div
      className="rounded-lg text-xs"
      style={{ border: "1px solid var(--fc-border)" }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        style={{ color: "var(--fc-text-secondary)" }}
      >
        <span>See exactly what&apos;s included</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
          style={{
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms",
          }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <pre
          className="px-3 py-2 overflow-auto max-h-56 whitespace-pre-wrap break-words"
          style={{
            color: "var(--fc-text-muted)",
            borderTop: "1px solid var(--fc-border)",
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
