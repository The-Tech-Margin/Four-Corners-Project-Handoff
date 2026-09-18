"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Grid3X3,
  ChevronLeft,
  ChevronRight,
  Network,
  Images,
  Layers,
} from "lucide-react";

export type ViewTab = "main" | "context" | "iiif" | "explore";

export interface FCViewFABProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  hasIIIF?: boolean;
  contextCount?: number;
  /** Whether to render the Explore tab. Defaults to true. Used by the
   *  view page to honor the global `gallery_explore_enabled` flag for
   *  non-owner viewers. */
  showExplore?: boolean;
}

/**
 * View-page navigation pill bar. Explore is a tab like 4C/IIIF/Related —
 * it renders inline on the view page (the card-list explore at every width;
 * the separate /explore page and its desktop tree graph were removed).
 */
export function FCViewFAB({
  activeTab,
  onTabChange,
  onBack,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  hasIIIF = false,
  contextCount = 0,
  showExplore = true,
}: FCViewFABProps) {
  // Always expanded — the bar flows inline below the primary image at every
  // width, so it never obstructs content and needs no collapse affordance.
  // Wider screens get roomier styling (text labels) via CSS + isDesktop.
  const fabRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  const handleTabChange = useCallback(
    (tab: ViewTab) => {
      onTabChange(tab);
      // Don't collapse — let user switch tabs freely
    },
    [onTabChange],
  );

  return (
    <div className="fc-fab" ref={fabRef}>
      <div className="fc-fab__pill">
        {/* Prev/Next gallery navigation */}
        {(hasPrev || hasNext) && (
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="fc-fab__nav"
            aria-label="Previous"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        {/* Gallery / Back */}
        <button onClick={onBack} className="fc-fab__btn" aria-label="Back to gallery">
          <Grid3X3 size={14} />
          {isDesktop && <span>Gallery</span>}
        </button>

        <div className="fc-fab__divider" />

        {/* Tabs */}
        <button
          onClick={() => handleTabChange("main")}
          className={`fc-fab__btn ${activeTab === "main" ? "fc-fab__btn--active" : ""}`}
          aria-label="Four Corners view"
        >
          4C
        </button>

        {hasIIIF && (
          <button
            onClick={() => handleTabChange("iiif")}
            className={`fc-fab__btn ${activeTab === "iiif" ? "fc-fab__btn--active" : ""}`}
            aria-label="IIIF metadata"
          >
            <Layers size={14} />
            {isDesktop && <span>IIIF</span>}
          </button>
        )}

        {contextCount > 0 && (
          <button
            onClick={() => handleTabChange("context")}
            className={`fc-fab__btn ${activeTab === "context" ? "fc-fab__btn--context-active" : ""}`}
            aria-label={`${contextCount} related images`}
          >
            <Images size={14} />
            {isDesktop && <span>Related</span>}
            <span className="fc-fab__count">{contextCount}</span>
          </button>
        )}

        {showExplore && (
          <button
            onClick={() => handleTabChange("explore")}
            className={`fc-fab__btn ${activeTab === "explore" ? "fc-fab__btn--active" : ""}`}
            aria-label="Explore connections"
          >
            <Network size={14} />
            {isDesktop && <span>Explore</span>}
          </button>
        )}

        {/* Prev/Next — after tabs */}
        {(hasPrev || hasNext) && (
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="fc-fab__nav"
            aria-label="Next"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Tracks the ≥1024px breakpoint for label-bearing desktop styling. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}
