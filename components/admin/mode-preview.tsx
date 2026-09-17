/**
 * Layout Mode Preview — shows all available editor modes as
 * previewable cards with direct links for testing.
 *
 * Updated to reflect new UX paradigms: wizard, chat, spatial, editorial.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { LAYOUT_MODES } from "@/lib/layout-modes";

const MODE_DETAILS: Record<
  string,
  {
    persona: string;
    time: string;
    philosophy: string;
    paradigm: string;
    paradigmColor: string;
  }
> = {
  scroll: {
    persona: "General",
    time: "Flexible",
    philosophy: "Full editor, all sections visible",
    paradigm: "Vertical Scroll",
    paradigmColor: "var(--fc-text-muted)",
  },
};

interface Props {
  paletteSlug?: string;
}

export function ModePreview({ paletteSlug }: Props) {
  return (
    <div>
      <h2
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--fc-text)" }}
      >
        Editor Modes
      </h2>
      <p
        className="text-sm mb-6"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Each mode uses a fundamentally different UX paradigm for the same data.
        {paletteSlug && " Links below include the current palette."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LAYOUT_MODES.map((mode) => {
          const details = MODE_DETAILS[mode.id];
          const params = new URLSearchParams();
          params.set("layout", mode.id);
          if (paletteSlug) params.set("persona", paletteSlug);
          const href = `/?${params.toString()}`;

          return (
            <a
              key={mode.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded-lg transition-all hover:scale-[1.02]"
              style={{
                background: "var(--fc-surface)",
                border: "1px solid var(--fc-border)",
              }}
            >
              {/* Header: name + time badge */}
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--fc-text)" }}
                >
                  {mode.label}
                </span>
            
              </div>

              {/* Paradigm badge */}
              {details && (
                <div className="mb-2">
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                    style={{
                      color: details.paradigmColor,
                      borderColor: details.paradigmColor,
                    }}
                  >
                    {details.paradigm}
                  </span>
                </div>
              )}

              {/* Description */}
              <p
                className="text-xs mb-2"
                style={{ color: "var(--fc-text-secondary)" }}
              >
                {mode.description}
              </p>

              {details && (
                <>
                  <p
                    className="text-[11px] mb-1"
                    style={{ color: "var(--fc-text-muted)" }}
                  >
                    <strong>Persona:</strong> {details.persona}
                  </p>
                  <p
                    className="text-[11px] italic"
                    style={{
                      color: "var(--fc-text-faint, var(--fc-text-muted))",
                    }}
                  >
                    {details.philosophy}
                  </p>
                </>
              )}

              <div className="mt-3 flex items-center gap-2">
                <span
                  className="text-[10px] font-mono"
                  style={{ color: "var(--fc-accent)" }}
                >
                  /?layout={mode.id}
                </span>
                <svg
                  className="w-3 h-3"
                  style={{ color: "var(--fc-text-muted)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
