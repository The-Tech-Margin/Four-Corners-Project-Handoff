"use client";

import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import { motion, type PanInfo } from "framer-motion";
import type {
  BackStory,
  ContextItem,
  Link,
  LocationData,
  PhotoMetadata,
  VoiceTranscription,
} from "@/lib/field-registry";
import { useFCViewer, type FCCornerKey } from "./use-fc-viewer";
import { isVideoUrl } from "@/lib/media-utils";
import { VideoPrimary } from "./video-primary";
import { FCCorner } from "./fc-corner";
import { FCPanel } from "./fc-panel";
import { FCPanelAuthorship, type AuthorshipData } from "./fc-panel-authorship";
import { FCPanelBackstory } from "./fc-panel-backstory";
import { FCPanelImagery } from "./fc-panel-imagery";
import { FCPanelLinks } from "./fc-panel-links";
import { dedupeVoiceNotes, hasAudioSource } from "@/components/fc-voice-note";

export interface FCPhotoViewerData {
  authorship: AuthorshipData;
  backstory: BackStory;
  imagery: ContextItem[];
  links: Link[];
  location?: LocationData;
  photoMetadata?: PhotoMetadata;
  voiceTranscriptions?: VoiceTranscription[];
  /** Optional headline for the cutline (project title or slug) */
  title?: string;
  /** Optional date for the cutline — ISO string or display string */
  date?: string;
}

export interface FCPhotoViewerProps {
  /** Image source URL — the canonical full-resolution original */
  imageSrc: string;
  /** Right-sized rendition shown first; the viewer upgrades to imageSrc in
   *  the background once it has painted. Omit to load imageSrc directly. */
  displaySrc?: string;
  /** Low-res thumbnail rendered as a blurred backdrop while loading */
  placeholderSrc?: string;
  /** Alt text for image */
  imageAlt?: string;
  /** Four corners metadata */
  data: FCPhotoViewerData;
  /** Display options */
  options?: {
    /** Show caption below image */
    showCutline?: boolean;
    /** Dark mode */
    dark?: boolean;
  };
  /** Optional className for container */
  className?: string;
  /** Project context for creating linked files from gallery */
  projectContext?: {
    projectId?: string;
    projectSlug?: string;
  };
  /** Hide creation/editing actions in public view mode */
  readOnly?: boolean;
  /** Disable corner interactions - corners show but are not clickable (for gallery preview) */
  disableCornerInteraction?: boolean;
  /** Current editing mode - affects which corners are visible */
  mode?: "minimal" | "standard" | "complete";
  /** Selected corners in minimal mode */
  selectedCorners?: {
    backstory: boolean;
    relatedImagery: boolean;
    links: boolean;
  };
  /** Callback when the image itself (not a corner/panel) is clicked — used by gallery cards to navigate */
  onImageClick?: () => void;
  /** Bump this value to replay the corner reveal animation (e.g. when the 4C tab is re-selected) */
  cornerAnimationKey?: string | number;
}

/**
 * Four Corners Photo Viewer
 *
 * Interactive photo viewer implementing Fred Ritchin's Four Corners concept.
 * Replicates the exact UX from fourcorners.js:
 * - Click corner to open panel (closes any other open panel)
 * - Click same corner again to close
 * - Click outside panels/corners to close all
 * - Only one panel open at a time
 * - Corner hides when its panel is active
 * - Empty corners show at 50% opacity
 */
export function FCPhotoViewer({
  imageSrc,
  displaySrc,
  placeholderSrc,
  imageAlt = "Four Corners photograph",
  data,
  options = {},
  className = "",
  projectContext,
  readOnly = false,
  disableCornerInteraction = false,
  mode = "complete",
  selectedCorners = { backstory: true, relatedImagery: false, links: false },
  onImageClick,
  cornerAnimationKey,
}: FCPhotoViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const photoColumnRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  // Corners reveal after the photograph has had time to fade in, so the image
  // emerges first and the four decorative corners animate in on top afterwards.
  const [cornersVisible, setCornersVisible] = useState(false);
  // Progressive loading: the rendition 404'd (fall back to the original),
  // the original finished its background upgrade, or nothing loaded at all.
  const [displayFailed, setDisplayFailed] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const hasRendition = !!displaySrc && displaySrc !== imageSrc;
  const activeSrc =
    !hasRendition || displayFailed || upgraded ? imageSrc : displaySrc;

  // Reset on source change so navigating between gallery items re-runs
  // the corner bounce intro every time the user lands on a new view.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setImageLoaded(false);
    setCornersVisible(false);
    setDisplayFailed(false);
    setUpgraded(false);
    setImageFailed(false);
    const el = imgRef.current;
    const freshActive =
      !displaySrc || displaySrc === imageSrc ? imageSrc : displaySrc;
    if (el?.complete && el.naturalWidth > 0 && el.src === freshActive) {
      setImageLoaded(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [imageSrc, displaySrc]);

  useEffect(() => {
    if (!imageLoaded) return;
    const timer = setTimeout(() => setCornersVisible(true), 360);
    return () => clearTimeout(timer);
  }, [imageLoaded]);

  // Background upgrade to the full-resolution original: once the rendition
  // has painted, fetch + decode imageSrc off-screen and swap it in without
  // flicker. Fidelity is never permanently downgraded.
  useEffect(() => {
    if (!imageLoaded || upgraded || displayFailed || !hasRendition) return;
    let stale = false;
    const full = new window.Image();
    full.src = imageSrc;
    full
      .decode()
      .then(() => {
        if (!stale) setUpgraded(true);
      })
      .catch(() => {
        // Original unavailable — keep showing the rendition.
      });
    return () => {
      stale = true;
    };
  }, [imageLoaded, upgraded, displayFailed, hasRendition, imageSrc]);

  // When the parent bumps cornerAnimationKey (e.g. the user clicks 4C in the nav),
  // briefly drop the fc-corners-visible class via direct DOM manipulation so the
  // CSS reveal transition runs again. Using the DOM (not React state) keeps this
  // out of the render path — no setState cascades inside the effect.
  const lastAnimKeyRef = useRef(cornerAnimationKey);
  useEffect(() => {
    // Skip first run: the initial reveal is already triggered by imageLoaded.
    if (lastAnimKeyRef.current === cornerAnimationKey) return;
    lastAnimKeyRef.current = cornerAnimationKey;
    const el = imageWrapperRef.current;
    if (!el || !imageLoaded) return;
    el.classList.remove("fc-corners-visible");
    // Force layout so the next frame sees the class as removed, then re-add it.
    void el.offsetWidth;
    const id = requestAnimationFrame(() => {
      el.classList.add("fc-corners-visible");
    });
    return () => cancelAnimationFrame(id);
  }, [cornerAnimationKey, imageLoaded]);

  // Measure the rendered image width and expose it as a CSS variable so the
  // cutline below can constrain itself to match (rather than sprawling to the
  // full container width).
  useEffect(() => {
    const el = imageWrapperRef.current;
    const col = photoColumnRef.current;
    if (!el || !col) return;
    const apply = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) col.style.setProperty("--fc-image-w", `${Math.round(w)}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imageLoaded]);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [showCornerHint, setShowCornerHint] = useState(false);
  const {
    activeCorner,
    toggleCorner,
    setHoveredCorner,
    closeAll,
    isActive,
    navigateToNextCorner,
    navigateToPrevCorner,
    openCorner,
  } = useFCViewer();

  // On mobile, scroll the card into view when a panel opens so the image
  // is visible at the top and the bottom-sheet panel appears beneath it.
  useEffect(() => {
    if (!activeCorner || !containerRef.current) return;
    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    if (!isMobile) return;

    containerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeCorner]);

  // Hint dismissal is handled in handleCornerClick below

  // Check for mobile and show hints on first visit.
  // The check + timer are deferred via requestAnimationFrame so setState
  // is not called synchronously inside the effect body.
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      const isMobile = window.matchMedia("(max-width: 720px)").matches;

      if (isMobile && !localStorage.getItem("fc-swipe-hint-seen")) {
        setShowSwipeHint(true);
      }
      if (isMobile && !localStorage.getItem("fc-corner-hint-seen")) {
        setShowCornerHint(true);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Auto-hide swipe hint after 4 seconds
  useEffect(() => {
    if (!showSwipeHint) return;
    const timer = setTimeout(() => {
      setShowSwipeHint(false);
      localStorage.setItem("fc-swipe-hint-seen", "true");
    }, 4000);
    return () => clearTimeout(timer);
  }, [showSwipeHint]);

  // Handle swipe on image area for corner navigation
  const handleImageSwipe = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      // Don't handle swipes if corner interaction is disabled
      if (disableCornerInteraction) return;

      const threshold = 75;

      // Hide swipe hint on first interaction
      if (showSwipeHint) {
        setShowSwipeHint(false);
        localStorage.setItem("fc-swipe-hint-seen", "true");
      }

      if (activeCorner) {
        // When panel is open, swipe horizontally to navigate between corners
        if (info.offset.x < -threshold) {
          navigateToNextCorner();
        } else if (info.offset.x > threshold) {
          navigateToPrevCorner();
        }
      } else {
        // When no panel open, swipe up to open first corner
        if (info.offset.y < -threshold) {
          openCorner("authorship");
        }
      }
    },
    [
      activeCorner,
      navigateToNextCorner,
      navigateToPrevCorner,
      openCorner,
      showSwipeHint,
      disableCornerInteraction,
    ],
  );

  // Drop phantom text-only transcription entries that duplicate a recorded
  // clip (failed pre-save uploads left audio-less copies attached to other
  // fields — they made the authorship panel show backstory text).
  const voiceTranscriptions = useMemo(
    () => dedupeVoiceNotes(data.voiceTranscriptions || []),
    [data.voiceTranscriptions],
  );

  // Check if each corner has content
  const hasAuthorship = Boolean(
    data.authorship.caption ||
    data.authorship.credit ||
    data.authorship.ethics ||
    data.authorship.photographerInfo ||
    data.location ||
    data.photoMetadata,
  );
  // A voice note on the backstory field counts as backstory content — the
  // corner must open for audio-only stories (transcript or recording alone).
  const hasBackstoryVoice = voiceTranscriptions.some(
    (vt) =>
      vt.fieldId === "backstory-text" &&
      (Boolean(vt.text?.trim()) || hasAudioSource(vt)),
  );
  const hasBackstory = Boolean(
    data.backstory.text ||
    data.backstory.author ||
    data.backstory.publication ||
    hasBackstoryVoice,
  );
  const hasImagery = data.imagery.length > 0;
  const hasLinks = data.links.length > 0;

  // Determine which corners should be visible based on mode
  // In minimal mode: show if selected OR has content (user added content outside mode)
  // In standard/complete mode: always show all corners that have content
  // Authorship is always shown if it has content
  const showBackstoryCorner =
    hasBackstory &&
    (mode === "complete" ||
      mode === "standard" ||
      selectedCorners.backstory ||
      hasBackstory);

  const showImageryCorner =
    hasImagery &&
    (mode === "complete" ||
      mode === "standard" ||
      selectedCorners.relatedImagery ||
      hasImagery);

  const showLinksCorner =
    hasLinks &&
    (mode === "complete" ||
      mode === "standard" ||
      selectedCorners.links ||
      hasLinks);

  // Authorship is always shown if it has content
  const showAuthorshipCorner = hasAuthorship;

  // Handle click outside to close panels, or navigate when onImageClick is set
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // Check if click is on a corner or panel (or their children)
      const isOnCorner = target.closest(".fc-corner");
      const isOnPanel = target.closest(".fc-panel");

      // If click is not on corner or panel, close all
      if (!isOnCorner && !isOnPanel) {
        // If no panel is open and onImageClick is provided, navigate
        if (!activeCorner && onImageClick) {
          onImageClick();
          return;
        }
        closeAll();
      }
    },
    [closeAll, activeCorner, onImageClick],
  );

  // Keyboard handling for accessibility + corner navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape" && activeCorner) {
        closeAll();
      } else if (e.key === "ArrowLeft" && activeCorner) {
        // Let imagery panel handle its own arrow navigation for image carousel
        if (activeCorner === "imagery") return;
        e.preventDefault();
        navigateToPrevCorner();
      } else if (e.key === "ArrowRight" && activeCorner) {
        if (activeCorner === "imagery") return;
        e.preventDefault();
        navigateToNextCorner();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeCorner, closeAll, navigateToNextCorner, navigateToPrevCorner]);

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Corner click handlers - disabled when disableCornerInteraction is true
  // Also dismisses the one-time corner hint on first interaction
  const handleCornerClick = useCallback(
    (corner: FCCornerKey) => () => {
      if (!disableCornerInteraction) {
        toggleCorner(corner);
        if (showCornerHint) {
          setShowCornerHint(false);
          localStorage.setItem("fc-corner-hint-seen", "true");
        }
      }
    },
    [toggleCorner, disableCornerInteraction, showCornerHint],
  );

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCornerHover = useCallback(
    (corner: FCCornerKey | null) => () => {
      if (disableCornerInteraction) return;
      setHoveredCorner(corner);

      // On desktop (hover-capable), open panel on hover with a short delay
      const isHoverDevice = window.matchMedia("(hover: hover)").matches;
      if (!isHoverDevice) return;

      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }

      if (corner) {
        hoverTimerRef.current = setTimeout(() => {
          openCorner(corner);
        }, 200);
      }
    },
    [setHoveredCorner, disableCornerInteraction, openCorner],
  );

  return (
    <div
      ref={containerRef}
      className={`fc-embed ${options.dark ? "fc-dark" : ""} ${className}`}
      onClick={handleContainerClick}
    >
      {/* Column wrapping the image + cutline so the cutline width matches the image */}
      <div ref={photoColumnRef} className="fc-photo-column fc-photo-column--sized">
      {/* Main image with swipe support — corners live INSIDE the image wrapper
           so they position relative to the image, not the full fc-embed container */}
      <motion.div
        ref={imageWrapperRef}
        className={`fc-image-wrapper${cornersVisible ? " fc-corners-visible" : ""}${!imageLoaded && !imageFailed && !isVideoUrl(imageSrc) ? " fc-image-wrapper--loading" : ""}`}
        aria-busy={!imageLoaded && !imageFailed}
        drag={onImageClick && !activeCorner ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        onDragEnd={handleImageSwipe}
        style={{ cursor: onImageClick && !activeCorner ? "pointer" : "grab" }}
        whileDrag={{ cursor: "grabbing" }}
      >
        {isVideoUrl(imageSrc) ? (
          <VideoPrimary
            src={imageSrc}
            className="fc-image"
            onLoadedMetadata={() => setImageLoaded(true)}
          />
        ) : (
          <>
            {/* Blurred thumbnail backdrop — paints instantly from the
                already-cached grid thumb; kept until the corners reveal so
                the photo's fade lands on it instead of bare background */}
            {placeholderSrc && !cornersVisible && !imageFailed && (
              <div className="fc-image-loading" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- decorative low-res backdrop */}
                <img
                  src={placeholderSrc}
                  alt=""
                  className="fc-image-loading__thumb"
                  draggable={false}
                />
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- viewer: external Supabase URLs, fidelity-critical */}
            <img
              src={activeSrc}
              alt={imageAlt}
              className="fc-image fc-protected-img"
              draggable={false}
              decoding="async"
              fetchPriority="high"
              style={{
                opacity: imageLoaded ? 1 : 0,
                transition: "opacity 520ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              ref={imgRef}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                if (activeSrc !== imageSrc) {
                  setDisplayFailed(true); // retry with the original
                } else {
                  setImageFailed(true);
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
            />
            {/* Canonical image-loading ring (shared with the lightbox),
                delayed so cached/instant loads never flash it */}
            {!imageLoaded && !imageFailed && (
              <div
                className="fc-gallery-loader fc-gallery-loader--delayed"
                aria-hidden="true"
              >
                <div className="fc-gallery-loader-spinner" />
              </div>
            )}
          </>
        )}
        {/* Transparent shield — blocks right-click/long-press on the image.
            z-index 2: above image, below corners (z-4) */}
        <div className="fc-image-shield" aria-hidden="true" onContextMenu={(e) => e.preventDefault()} />

        {/* Four corners - L-shaped indicators (inside image wrapper for correct positioning)
             Hidden until image loads to prevent corners floating in empty space */}
        {showAuthorshipCorner && (
          <FCCorner
            position="authorship"
            isActive={isActive("authorship")}
            hasContent={hasAuthorship}
            onClick={handleCornerClick("authorship")}
            onMouseEnter={handleCornerHover("authorship")}
            onMouseLeave={handleCornerHover(null)}
            label="Open authorship and ethics panel"
            disabled={disableCornerInteraction}
            showHint={showCornerHint}
          />
        )}
        {showBackstoryCorner && (
          <FCCorner
            position="backstory"
            isActive={isActive("backstory")}
            hasContent={hasBackstory}
            onClick={handleCornerClick("backstory")}
            onMouseEnter={handleCornerHover("backstory")}
            onMouseLeave={handleCornerHover(null)}
            label="Open backstory panel"
            disabled={disableCornerInteraction}
            showHint={showCornerHint}
          />
        )}
        {showImageryCorner && (
          <FCCorner
            position="imagery"
            isActive={isActive("imagery")}
            hasContent={hasImagery}
            onClick={handleCornerClick("imagery")}
            onMouseEnter={handleCornerHover("imagery")}
            onMouseLeave={handleCornerHover(null)}
            label="Open related imagery panel"
            disabled={disableCornerInteraction}
            showHint={showCornerHint}
          />
        )}
        {showLinksCorner && (
          <FCCorner
            position="links"
            isActive={isActive("links")}
            hasContent={hasLinks}
            onClick={handleCornerClick("links")}
            onMouseEnter={handleCornerHover("links")}
            onMouseLeave={handleCornerHover(null)}
            label="Open links panel"
            disabled={disableCornerInteraction}
            showHint={showCornerHint}
          />
        )}
      </motion.div>

      {/* Four panels - slide-out overlays */}
      <FCPanel
        position="authorship"
        isActive={isActive("authorship")}
        onClose={closeAll}
        title="Authorship"
      >
        <FCPanelAuthorship
          data={data.authorship}
          location={data.location}
          photoMetadata={data.photoMetadata}
          voiceTranscriptions={voiceTranscriptions}
        />
      </FCPanel>

      <FCPanel
        position="backstory"
        isActive={isActive("backstory")}
        onClose={closeAll}
        title="Backstory"
      >
        <FCPanelBackstory data={data.backstory} voiceTranscriptions={voiceTranscriptions} />
      </FCPanel>

      <FCPanel
        position="imagery"
        isActive={isActive("imagery")}
        onClose={closeAll}
        title="Related Imagery"
      >
        <FCPanelImagery
          data={data.imagery}
          mainImageSrc={imageSrc}
          projectContext={
            projectContext
              ? {
                  projectId: projectContext.projectId,
                  projectSlug: projectContext.projectSlug,
                  backStory: data.backstory,
                  links: data.links,
                  creativeCommons: data.authorship.credit
                    ? {
                        copyright: data.authorship.credit,
                        description: data.authorship.caption ?? "",
                      }
                    : undefined,
                  ethics: data.authorship.ethics,
                  photographerInfo: data.authorship.photographerInfo,
                  location: data.location,
                  photoMetadata: data.photoMetadata,
                  voiceTranscriptions: voiceTranscriptions,
                }
              : undefined
          }
          readOnly={readOnly}
        />
      </FCPanel>

      <FCPanel
        position="links"
        isActive={isActive("links")}
        onClose={closeAll}
        title="Links"
      >
        <FCPanelLinks data={data.links} />
      </FCPanel>

      {/* Structured cutline below image — framed to image width via .fc-photo-column.
          Only the title + author · date; long caption/credit live in the 4C panels. */}
      {options.showCutline &&
        (data.title || data.authorship.author || data.date) && (
          <div className="fc-cutline">
            {data.title && <h2 className="fc-cutline__title">{data.title}</h2>}
            {(data.authorship.author || data.date) && (
              <div className="fc-cutline__byline">
                {data.authorship.author && (
                  <span className="fc-cutline__author">{data.authorship.author}</span>
                )}
                {data.authorship.author && data.date && (
                  <span className="fc-cutline__byline-sep" aria-hidden="true">·</span>
                )}
                {data.date && (
                  <time className="fc-cutline__date">{formatCutlineDate(data.date)}</time>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatCutlineDate(input: string): string {
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Re-export types and sub-components for convenience
export { useFCViewer, FCCorner, FCPanel };
export type { FCCornerKey, FCPhotoViewerData as FCViewerData };
