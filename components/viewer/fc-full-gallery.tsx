"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, type PanInfo, AnimatePresence } from "framer-motion";
import { FCAudioPlayer } from "./fc-audio-player";
import { FCVoiceNote } from "@/components/fc-voice-note";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  ContextItem,
  BackStory,
  Link,
  CreativeCommons,
  CodeOfEthics,
  PhotographerInfo,
  LocationData,
  PhotoMetadata,
  VoiceTranscription,
} from "@/lib/field-registry";

export interface FCFullGalleryProps {
  data: ContextItem[];
  isOpen: boolean;
  initialIndex?: number;
  onClose: () => void;
  onBackToCorner: () => void;
  /** Main image URL of the parent project - will become a related image in new file */
  mainImageSrc?: string;
  /** Parent project metadata for creating linked files */
  projectContext?: {
    projectId?: string;
    projectSlug?: string;
    backStory?: BackStory;
    links?: Link[];
    creativeCommons?: CreativeCommons;
    ethics?: CodeOfEthics;
    photographerInfo?: PhotographerInfo;
    location?: LocationData;
    photoMetadata?: PhotoMetadata;
    voiceTranscriptions?: VoiceTranscription[];
  };
  /** Hide creation/editing actions in public view mode */
  readOnly?: boolean;
}

/**
 * Get the best available media source URL for FULL-SIZE display.
 * Prioritise the stored URL for the original upload,
 * then remote URLs, then thumbnails as last resort.
 * `src` is deprioritised — it is typically a local data-URL thumbnail
 * created during the add-image flow and should not be used in the
 * full-screen gallery when a proper storage URL exists.
 */
function getImageSrc(item: ContextItem | undefined): string {
  if (!item) return "";
  return (
    item.storage_url ||           // Full-size storage public URL
    item.url ||                   // Remote URL (for url-sourced items)
    item.thumbnail_storage_url || // storage thumbnail (better than data URL)
    item.src ||                   // Local data URL fallback
    item.thumbnailDataUrl ||      // Base64 thumbnail last resort
    ""
  );
}

/** Check if an item is a video based on type or mimeType */
function isVideoItem(item: ContextItem | undefined): boolean {
  if (!item) return false;
  if (item.type === "video") return true;
  if (item.mimeType?.startsWith("video/")) return true;
  const src = item.storage_url || item.url || item.src || "";
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(src);
}

/**
 * Full-screen gallery overlay for Related Imagery
 * Mobile-first with swipe navigation, zoom, and clear back navigation
 */
export function FCFullGallery({
  data,
  isOpen,
  initialIndex = 0,
  onClose,
  onBackToCorner,
  projectContext,
}: FCFullGalleryProps) {
  // Reset state when gallery opens or initialIndex changes.
  // React 19 pattern: derive state from props by storing the previous prop in state
  // and calling setState during render (before returning JSX) to batch the update.
  const [prevOpen, setPrevOpen] = useState(isOpen);
  const [prevInit, setPrevInit] = useState(initialIndex);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);

  if (isOpen && (!prevOpen || prevInit !== initialIndex)) {
    setPrevOpen(isOpen);
    setPrevInit(initialIndex);
    setCurrentIndex(initialIndex);
    setIsZoomed(false);
    setIsImageLoading(true);
  } else if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
  }

  // Prevent body scroll when gallery is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // Clamp index to valid range — data can change between renders
  const safeIndex = data.length > 0 ? Math.min(currentIndex, data.length - 1) : 0;
  const currentItem = data[safeIndex];
  const hasMultiple = data.length > 1;

  // Match voice transcriptions to a context item by id (new) or index (legacy)
  const matchesItem = (fieldId: string | undefined, item: ContextItem, index: number) => {
    if (!fieldId) return false;
    return (
      fieldId === `context-${item.id}` ||
      fieldId === `context-desc-${item.id}` ||
      fieldId === item.id ||
      fieldId === `context-image-caption-${index}` ||
      fieldId === `context-image-description-${index}`
    );
  };

  const currentTranscriptions = currentItem
    ? (projectContext?.voiceTranscriptions || []).filter(
        (t: VoiceTranscription) => matchesItem(t.fieldId, currentItem, currentIndex),
      )
    : [];

  // Navigation — reset loading state inline to avoid effect
  const goToNext = useCallback(() => {
    if (!isZoomed && currentIndex < data.length - 1) {
      setCurrentIndex((i) => i + 1);
      setIsImageLoading(true);
    }
  }, [data.length, isZoomed, currentIndex]);

  const goToPrev = useCallback(() => {
    if (!isZoomed && currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setIsImageLoading(true);
    }
  }, [isZoomed, currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          goToPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNext();
          break;
        case "Escape":
          e.preventDefault();
          if (isZoomed) {
            setIsZoomed(false);
          } else {
            onClose();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, goToNext, goToPrev, isZoomed, onClose]);

  // Swipe handling - mobile optimized
  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (isZoomed) return;

    const swipeThreshold = 30; // Lower for easier mobile swipe
    const closeThreshold = 150; // Higher to prevent accidental closes

    // Horizontal swipe for navigation
    if (info.offset.x < -swipeThreshold && currentIndex < data.length - 1) {
      goToNext();
    } else if (info.offset.x > swipeThreshold && currentIndex > 0) {
      goToPrev();
    }

    // Swipe down to close - only if clearly intentional
    if (info.offset.y > closeThreshold && Math.abs(info.offset.x) < 50) {
      onClose();
    }
  };

  // Toggle zoom
  const toggleZoom = () => {
    setIsZoomed(!isZoomed);
  };

  // Don't render until mounted (for portal) or if not open
  if (typeof document === "undefined" || !isOpen || data.length === 0 || !currentItem) return null;

  const src = getImageSrc(currentItem);
  const isVideo = isVideoItem(currentItem);

  // Render via portal to escape any containing transforms/stacking contexts
  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fc-full-gallery"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        role="dialog"
        aria-modal="true"
        aria-label="Image gallery"
      >
        {/* Header with navigation */}
        <div className="fc-gallery-header">
          <button
            className="fc-gallery-back"
            onClick={(e) => {
              e.stopPropagation();
              onBackToCorner();
            }}
            aria-label="Back to previous view"
          >
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>

          <div className="fc-gallery-header-center">
            <span className="fc-gallery-title">Related Images</span>
            <span className="fc-gallery-counter" aria-live="polite">
              {currentIndex + 1} / {data.length}
            </span>
          </div>

          <button
            className="fc-gallery-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close gallery"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable content: card contains image + metadata */}
        <div className="fc-gallery-scroll">
          <div className="fc-gallery-card">
            {/* Image/Video inside card */}
            <motion.div
              className="fc-gallery-media-wrapper"
              drag={!isZoomed && hasMultiple ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
            >
              {/* Previous button */}
              {hasMultiple && !isZoomed && (
                <button
                  className="fc-gallery-nav fc-gallery-nav--prev"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToPrev();
                  }}
                  disabled={currentIndex === 0}
                  aria-label="Previous image"
                >
                  <ChevronLeft size={32} />
                </button>
              )}

              <motion.div
                className="fc-gallery-media-container"
                animate={{ scale: isZoomed ? 2 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                {isImageLoading && !isVideo && (
                  <div className="fc-gallery-loader">
                    <div className="fc-gallery-loader-spinner" />
                  </div>
                )}
                {isVideo ? (
                  src ? (
                    <video
                      key={src}
                      src={src}
                      controls
                      playsInline
                      preload="metadata"
                      aria-label={currentItem.caption || "Related video"}
                      className="fc-gallery-video"
                    >
                      {currentItem.mimeType && <source src={src} type={currentItem.mimeType} />}
                    </video>
                  ) : (
                    <div className="fc-gallery-no-media" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#9a9a9a", fontSize: 14, padding: 40 }}>
                      Video not available
                    </div>
                  )
                ) : src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- lightbox: stored media, fidelity-critical
                  <img
                    src={src}
                    alt={currentItem.caption || `Image ${currentIndex + 1}`}
                    className={`fc-gallery-image ${isZoomed ? "fc-gallery-image--zoomed" : ""} ${isImageLoading ? "fc-gallery-image--loading" : ""}`}
                    onClick={toggleZoom}
                    onLoad={() => setIsImageLoading(false)}
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                ) : (
                  <div className="fc-gallery-no-media" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#9a9a9a", fontSize: 14, padding: 40 }}>
                    Media not available
                  </div>
                )}
              </motion.div>

              {/* Next button */}
              {hasMultiple && !isZoomed && (
                <button
                  className="fc-gallery-nav fc-gallery-nav--next"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToNext();
                  }}
                  disabled={currentIndex === data.length - 1}
                  aria-label="Next image"
                >
                  <ChevronRight size={32} />
                </button>
              )}
            </motion.div>

            {/* Zoom button overlay on image */}
            {!isVideo && (
              <div className="fc-gallery-actions">
                <button
                  className="fc-gallery-zoom"
                  onClick={(e) => { e.stopPropagation(); toggleZoom(); }}
                  aria-label={isZoomed ? "Zoom out" : "Zoom in"}
                >
                  {isZoomed ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
                </button>
              </div>
            )}

            {/* Metadata below image, inside card */}
            <div className="fc-gallery-card-meta">
              <div className="fc-imagery-meta-row">
                <span className="fc-imagery-counter">
                  {currentIndex + 1} of {data.length}
                </span>
              </div>
              {currentItem.caption && (
                <>
                  <div className="fc-imagery-transcription-label">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    <span>Caption</span>
                  </div>
                  <p className="fc-imagery-caption">{currentItem.caption}</p>
                </>
              )}
              {currentItem.description && currentItem.description !== currentItem.caption && (
                <>
                  <div className="fc-imagery-transcription-label">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    <span>Description</span>
                  </div>
                  <p className="fc-imagery-description">{currentItem.description}</p>
                </>
              )}
              {(currentItem.credit || currentItem.date) && (
                <div className="fc-imagery-credit-date">
                  {currentItem.credit && (
                    <span className="fc-imagery-credit">{currentItem.credit}</span>
                  )}
                  {currentItem.credit && currentItem.date && (
                    <span className="fc-imagery-separator">·</span>
                  )}
                  {currentItem.date && (
                    <span className="fc-imagery-date">{currentItem.date}</span>
                  )}
                </div>
              )}
              {currentTranscriptions.length > 0 && (
                <div className="fc-imagery-transcriptions">
                  <FCVoiceNote
                    // Hide transcripts that just repeat the caption/description shown above
                    transcriptions={currentTranscriptions.map((t: VoiceTranscription) => {
                      const repeatsVisibleText =
                        t.text &&
                        ((currentItem.caption && t.text.trim() === currentItem.caption.trim()) ||
                          (currentItem.description && t.text.trim() === currentItem.description.trim()));
                      return repeatsVisibleText ? { ...t, text: "" } : t;
                    })}
                    clipClassName="fc-imagery-transcription"
                    accentClass="bg-corner-context/20"
                    accentTextClass="text-corner-context"
                    renderText={(text) => (
                      <div>
                        <div className="fc-imagery-transcription-label">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          <span>Voice transcription</span>
                        </div>
                        <p className="fc-imagery-transcription-text">{text}</p>
                      </div>
                    )}
                  />
                </div>
              )}
              {(currentItem.audioStorageUrl || currentItem.audioDataUrl) && (
                <div className="fc-imagery-audio">
                  <FCAudioPlayer src={(currentItem.audioStorageUrl || currentItem.audioDataUrl)!} accentClass="bg-corner-context/20" accentTextClass="text-corner-context" />
                </div>
              )}
            </div>
          </div>

          {/* Dot indicators */}
          {hasMultiple && (
            <div className="fc-gallery-dots" role="tablist" aria-label="Image navigation">
              {data.map((_, i) => (
                <button
                  key={i}
                  className={`fc-gallery-dot ${i === currentIndex ? "fc-gallery-dot--active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); if (!isZoomed) { setCurrentIndex(i); setIsImageLoading(true); } }}
                  role="tab"
                  aria-selected={i === currentIndex}
                  aria-label={`Go to image ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
