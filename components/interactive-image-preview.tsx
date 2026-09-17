"use client";

import { useCallback, useState, useMemo } from "react";
import { useFourCornersStore } from "@/lib/store";
import { isVideoUrl } from "@/lib/media-utils";
import { VideoPrimary } from "./viewer/video-primary";
import { CornerIndicator } from "./corner-indicator";
import { useFCViewer, type FCCornerKey } from "./viewer/use-fc-viewer";
import { FCPanel } from "./viewer/fc-panel";
import { FCPanelAuthorship } from "./viewer/fc-panel-authorship";
import { FCPanelBackstory } from "./viewer/fc-panel-backstory";
import { FCPanelImagery } from "./viewer/fc-panel-imagery";
import { FCPanelLinks } from "./viewer/fc-panel-links";
import { dedupeVoiceNotes, hasAudioSource } from "@/components/fc-voice-note";

interface InteractiveImagePreviewProps {
  onCornerClick: (sectionId: string) => void;
  showPanels?: boolean;
}

// Map corner keys to section IDs for scrolling
const cornerToSection: Record<FCCornerKey, string> = {
  authorship: "credit-ethics",
  backstory: "backstory",
  imagery: "context-images",
  links: "links",
};

// Tooltip labels for each corner
const cornerLabels: Record<FCCornerKey, string> = {
  imagery: "Related Imagery",
  links: "Related Links",
  backstory: "Backstory & Context",
  authorship: "Authorship",
};

export function InteractiveImagePreview({
  onCornerClick,
  showPanels = true,
}: InteractiveImagePreviewProps) {
  const imageSrc = useFourCornersStore((state) => state.imageSrc);
  const creativeCommons = useFourCornersStore((state) => state.creativeCommons);
  const backStory = useFourCornersStore((state) => state.backStory);
  const context = useFourCornersStore((state) => state.context);
  const links = useFourCornersStore((state) => state.links);
  const ethics = useFourCornersStore((state) => state.ethics);
  const photographerInfo = useFourCornersStore(
    (state) => state.photographerInfo
  );
  const location = useFourCornersStore((state) => state.location);
  const photoMetadata = useFourCornersStore((state) => state.photoMetadata);
  const voiceTranscriptions = useFourCornersStore((state) => state.voiceTranscriptions);
  const projectId = useFourCornersStore((state) => state.projectId);
  const projectSlug = useFourCornersStore((state) => state.projectSlug);
  const mode = useFourCornersStore((state) => state.mode);
  const selectedCorners = useFourCornersStore((state) => state.selectedCorners);

  // Four Corners viewer state
  const { toggleCorner, closeAll, isActive } = useFCViewer();

  // Tooltip state for corner hover/touch
  const [hoveredCorner, setHoveredCorner] = useState<FCCornerKey | null>(null);

  // Data presence detection
  const hasCreditData = Boolean(
    creativeCommons.copyright ||
      creativeCommons.description ||
      photographerInfo?.bio ||
      ethics?.noManipulation ||
      ethics?.noStaging ||
      ethics?.informedConsent
  );

  // Phantom text-only duplicates of recorded clips are dropped before any
  // panel sees them (same rule as the public viewer).
  const dedupedTranscriptions = useMemo(
    () => dedupeVoiceNotes(voiceTranscriptions || []),
    [voiceTranscriptions],
  );

  const hasBackstoryData = Boolean(
    backStory.text ||
      backStory.author ||
      backStory.date ||
      // Voice-only backstory still lights up / opens the corner
      dedupedTranscriptions.some(
        (vt) =>
          vt.fieldId === "backstory-text" &&
          (Boolean(vt.text?.trim()) || hasAudioSource(vt)),
      )
  );

  const hasContextData = Boolean(context.length > 0);

  const hasLinksData = Boolean(links.length > 0);

  // Determine which corners should be visible based on mode
  const showBackstoryCorner =
    mode === "complete" ||
    mode === "standard" ||
    selectedCorners.backstory ||
    hasBackstoryData;

  const showContextCorner =
    mode === "complete" ||
    mode === "standard" ||
    selectedCorners.relatedImagery ||
    hasContextData;

  const showLinksCorner =
    mode === "complete" ||
    mode === "standard" ||
    selectedCorners.links ||
    hasLinksData;

  const showCreditCorner = true;

  // Handle corner click - toggle panel (if enabled) AND scroll to section
  const handleCornerClick = useCallback(
    (corner: FCCornerKey) => (e: React.MouseEvent) => {
      e.stopPropagation();
      if (showPanels) {
        toggleCorner(corner);
      }
      onCornerClick(cornerToSection[corner]);
    },
    [toggleCorner, onCornerClick, showPanels]
  );

  // Handle click outside to close panels
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!showPanels) return;
      const target = e.target as HTMLElement;
      const isOnCorner = target.closest("button");
      const isOnPanel = target.closest(".fc-panel");
      if (!isOnCorner && !isOnPanel) {
        closeAll();
      }
    },
    [closeAll, showPanels]
  );

  // Process context images for panel — ensure url fallback for unsaved uploads
  const processedContext = context.map((item) => {
    if (item.sourceType === "upload" && !item.storage_url && !item.url) {
      // Only set url fallback for items that haven't been uploaded to storage yet
      return {
        ...item,
        url: item.thumbnailDataUrl || "",
      };
    }
    return item;
  });

  return (
    <div
      className="fc-image-container absolute inset-0"
      onClick={handleContainerClick}
    >
      {imageSrc && (
        isVideoUrl(imageSrc) ? (
          <VideoPrimary
            src={imageSrc}
            className="w-full h-full object-cover"
            fillParent
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- editor preview, stored media
          <img
            src={imageSrc}
            alt={creativeCommons.description || "Four Corners image preview"}
            className="w-full h-full object-cover"
          />
        )
      )}

      {/* Top-Left: Related Imagery Corner (Purple) */}
      {showContextCorner && (
        <button
          className={`absolute top-2 left-2 w-8 h-8 bg-transparent border-none cursor-pointer p-0 z-10 transition-all hover:scale-110 flex items-start justify-start ${showPanels && isActive("imagery") ? "opacity-0 pointer-events-none" : ""}`}
          onClick={handleCornerClick("imagery")}
          onMouseEnter={() => setHoveredCorner("imagery")}
          onMouseLeave={() => setHoveredCorner(null)}
          onPointerDown={(e) => { if (e.pointerType === "touch") { e.preventDefault(); setHoveredCorner((v) => v === "imagery" ? null : "imagery"); } }}
          aria-label="Context images corner"
        >
          <CornerIndicator
            color="var(--fc-corner-context)"
            filled={hasContextData}
            position="top-left"
          />
          {hoveredCorner === "imagery" && (
            <div className="absolute left-full top-0 ml-1 z-50 pointer-events-none whitespace-nowrap rounded px-2 py-1 text-xs font-medium shadow-lg" style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-corner-context)", color: "var(--fc-corner-context)" }}>
              {cornerLabels.imagery}
            </div>
          )}
        </button>
      )}

      {/* Top-Right: Links Corner (Lime) */}
      {showLinksCorner && (
        <button
          className={`absolute top-2 right-2 w-8 h-8 bg-transparent border-none cursor-pointer p-0 z-10 transition-all hover:scale-110 flex items-start justify-end ${showPanels && isActive("links") ? "opacity-0 pointer-events-none" : ""}`}
          onClick={handleCornerClick("links")}
          onMouseEnter={() => setHoveredCorner("links")}
          onMouseLeave={() => setHoveredCorner(null)}
          onPointerDown={(e) => { if (e.pointerType === "touch") { e.preventDefault(); setHoveredCorner((v) => v === "links" ? null : "links"); } }}
          aria-label="Links corner"
        >
          <CornerIndicator
            color="var(--fc-corner-links)"
            filled={hasLinksData}
            position="top-right"
          />
          {hoveredCorner === "links" && (
            <div className="absolute right-full top-0 mr-1 z-50 pointer-events-none whitespace-nowrap rounded px-2 py-1 text-xs font-medium shadow-lg" style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-corner-links)", color: "var(--fc-corner-links)" }}>
              {cornerLabels.links}
            </div>
          )}
        </button>
      )}

      {/* Bottom-Left: Backstory Corner (Cyan) */}
      {showBackstoryCorner && (
        <button
          className={`absolute bottom-2 left-2 w-8 h-8 bg-transparent border-none cursor-pointer p-0 z-10 transition-all hover:scale-110 flex items-end justify-start ${showPanels && isActive("backstory") ? "opacity-0 pointer-events-none" : ""}`}
          onClick={handleCornerClick("backstory")}
          onMouseEnter={() => setHoveredCorner("backstory")}
          onMouseLeave={() => setHoveredCorner(null)}
          onPointerDown={(e) => { if (e.pointerType === "touch") { e.preventDefault(); setHoveredCorner((v) => v === "backstory" ? null : "backstory"); } }}
          aria-label="Backstory corner"
        >
          <CornerIndicator
            color="var(--fc-corner-backstory)"
            filled={hasBackstoryData}
            position="bottom-left"
          />
          {hoveredCorner === "backstory" && (
            <div className="absolute left-full bottom-0 ml-1 z-50 pointer-events-none whitespace-nowrap rounded px-2 py-1 text-xs font-medium shadow-lg" style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-corner-backstory)", color: "var(--fc-corner-backstory)" }}>
              {cornerLabels.backstory}
            </div>
          )}
        </button>
      )}

      {/* Bottom-Right: Authorship Corner (Orange) - Always shown */}
      {showCreditCorner && (
        <button
          className={`absolute bottom-2 right-2 w-8 h-8 bg-transparent border-none cursor-pointer p-0 z-10 transition-all hover:scale-110 flex items-end justify-end ${showPanels && isActive("authorship") ? "opacity-0 pointer-events-none" : ""}`}
          onClick={handleCornerClick("authorship")}
          onMouseEnter={() => setHoveredCorner("authorship")}
          onMouseLeave={() => setHoveredCorner(null)}
          onPointerDown={(e) => { if (e.pointerType === "touch") { e.preventDefault(); setHoveredCorner((v) => v === "authorship" ? null : "authorship"); } }}
          aria-label="Authorship corner"
        >
          <CornerIndicator
            color="var(--fc-corner-cc)"
            filled={hasCreditData}
            position="bottom-right"
          />
          {hoveredCorner === "authorship" && (
            <div className="absolute right-full bottom-0 mr-1 z-50 pointer-events-none whitespace-nowrap rounded px-2 py-1 text-xs font-medium shadow-lg" style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-corner-cc)", color: "var(--fc-corner-cc)" }}>
              {cornerLabels.authorship}
            </div>
          )}
        </button>
      )}

      {/* Panels - only rendered when showPanels is true */}
      {showPanels && (
        <>
          <FCPanel
            position="links"
            isActive={isActive("links")}
            onClose={closeAll}
            title="Links"
          >
            <FCPanelLinks data={links} />
          </FCPanel>

          <FCPanel
            position="imagery"
            isActive={isActive("imagery")}
            onClose={closeAll}
            title="Related Imagery"
          >
            <FCPanelImagery
              data={processedContext}
              mainImageSrc={imageSrc || undefined}
              projectContext={{
                projectId: projectId || undefined,
                projectSlug: projectSlug || undefined,
                backStory,
                links,
                creativeCommons: creativeCommons.copyright
                  ? { copyright: creativeCommons.copyright, description: creativeCommons.description }
                  : undefined,
                ethics,
                photographerInfo,
                location,
                photoMetadata,
                voiceTranscriptions: dedupedTranscriptions,
              }}
            />
          </FCPanel>

          <FCPanel
            position="backstory"
            isActive={isActive("backstory")}
            onClose={closeAll}
            title="Backstory"
          >
            <FCPanelBackstory data={backStory} voiceTranscriptions={dedupedTranscriptions} />
          </FCPanel>

          <FCPanel
            position="authorship"
            isActive={isActive("authorship")}
            onClose={closeAll}
            title="Authorship"
          >
            <FCPanelAuthorship
              data={{
                caption: creativeCommons.description,
                credit: creativeCommons.copyright,
                ethics: ethics,
                photographerInfo: photographerInfo,
              }}
              location={location}
              photoMetadata={photoMetadata}
              voiceTranscriptions={dedupedTranscriptions}
            />
          </FCPanel>
        </>
      )}
    </div>
  );
}
