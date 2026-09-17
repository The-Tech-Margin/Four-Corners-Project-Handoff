"use client";

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
import { useState, useEffect, useCallback } from "react";
import {
  Play,
  Image as ImageIcon,
  Video,
  Maximize2,
} from "lucide-react";
import { FCFullGallery } from "./fc-full-gallery";
import { FCAudioPlayer } from "./fc-audio-player";
import { FCVoiceNote } from "@/components/fc-voice-note";
import { encodeProjectId } from "@/lib/encode-id";

export interface FCPanelImageryProps {
  data: ContextItem[];
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
 * Get the best available media source URL - prioritize full-size
 */
function getMediaSrc(item: ContextItem | undefined): string | undefined {
  if (!item) return undefined;
  return (
    item.storage_url ||
    item.url ||
    item.src ||
    item.thumbnail_storage_url ||
    item.thumbnailDataUrl ||
    undefined
  );
}

/** Check if an item is a video based on type or mimeType */
function isVideoItem(item: ContextItem | undefined): boolean {
  if (!item) return false;
  if (item.type === "video") return true;
  if (item.mimeType?.startsWith("video/")) return true;
  // Check URL extension as fallback
  const src = item.storage_url || item.url || item.src || "";
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(src);
}

/**
 * Imagery panel content (top-right corner).
 * Swipeable carousel with arrow navigation and metadata display.
 */
export function FCPanelImagery({
  data,
  mainImageSrc,
  projectContext,
  readOnly = false,
}: FCPanelImageryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullGallery, setIsFullGallery] = useState(false);

  // Clamp index to valid range — data can change (upload/save) between renders
  const safeIndex = data.length > 0 ? Math.min(currentIndex, data.length - 1) : 0;
  const currentItem = data[safeIndex];

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

  // Full gallery handlers
  const openFullGallery = useCallback(() => {
    setIsFullGallery(true);
  }, []);

  const closeFullGallery = useCallback(() => {
    setIsFullGallery(false);
  }, []);

  // Navigation functions
  const goToNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, data.length - 1));
  }, [data.length]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNext, goToPrev]);

  /** Render metadata block for a single item */
  const renderItemMeta = (item: ContextItem, index: number) => {
    const itemTranscriptions = (projectContext?.voiceTranscriptions || []).filter(
      (t: VoiceTranscription) => matchesItem(t.fieldId, item, index),
    );

    return (
      <>
        {item.caption && (
          <>
            <div className="fc-imagery-transcription-label">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <span>Caption</span>
            </div>
            <p className="fc-imagery-caption">{item.caption}</p>
          </>
        )}
        {item.description && item.description !== item.caption && (
          <>
            <div className="fc-imagery-transcription-label">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <span>Description</span>
            </div>
            <p className="fc-imagery-description">{item.description}</p>
          </>
        )}
        {(item.credit || item.date) && (
          <div className="fc-imagery-credit-date">
            {item.credit && (
              <span className="fc-imagery-credit">{item.credit}</span>
            )}
            {item.credit && item.date && (
              <span className="fc-imagery-separator">·</span>
            )}
            {item.date && (
              <span className="fc-imagery-date">{item.date}</span>
            )}
          </div>
        )}
        {itemTranscriptions.length > 0 && (
          <div className="fc-imagery-transcriptions">
            <FCVoiceNote
              // Hide transcripts that just repeat the caption/description shown above
              transcriptions={itemTranscriptions.map((t: VoiceTranscription) => {
                const repeatsVisibleText =
                  t.text &&
                  ((item.caption && t.text.trim() === item.caption.trim()) ||
                    (item.description && t.text.trim() === item.description.trim()));
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
        {(item.audioStorageUrl || item.audioDataUrl) && (
          <div className="fc-imagery-audio">
            <FCAudioPlayer src={(item.audioStorageUrl || item.audioDataUrl)!} accentClass="bg-corner-context/20" accentTextClass="text-corner-context" />
          </div>
        )}
        {item.linkedProjectSlug && (
          <a
            href={`/view/${encodeProjectId(item.linkedProjectSlug)}`}
            className="fc-imagery-linked-project"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Linked Four Corners project
          </a>
        )}
      </>
    );
  };

  if (data.length === 0) {
    return <p className="fc-panel__empty">No related imagery available.</p>;
  }

  const src = getMediaSrc(currentItem);
  const isVideo = isVideoItem(currentItem);

  return (
    <div
      className="fc-imagery-carousel"
      role="region"
      aria-label="Related imagery gallery"
    >
      {/* ── Mobile: vertical scroll list (shown ≤720px via CSS) ── */}
      <div className="fc-imagery-mobile-list">
        {data.map((item, i) => {
          const itemSrc = getMediaSrc(item);
          const itemIsVideo = isVideoItem(item);

          return (
            <div key={item.id || i} className="fc-imagery-mobile-item">
              <div
                className="fc-imagery-mobile-media"
                aria-label={`${itemIsVideo ? "Video" : "Image"} ${i + 1} — tap to open gallery`}
                role="button"
                tabIndex={0}
                onClick={() => { setCurrentIndex(i); openFullGallery(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCurrentIndex(i); openFullGallery(); } }}
                style={{ cursor: "pointer" }}
              >
                {itemIsVideo ? (
                  itemSrc ? (
                    <div className="fc-imagery-video-container">
                      <video
                        src={itemSrc}
                        playsInline
                        muted
                        preload="metadata"
                        className="fc-imagery-video"
                      />
                      <div className="fc-imagery-video-play-overlay" aria-hidden="true" style={{
                        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.25)", pointerEvents: "none",
                      }}>
                        <svg width={40} height={40} viewBox="0 0 24 24" fill="white" opacity={0.85}><polygon points="8,5 19,12 8,19" /></svg>
                      </div>
                    </div>
                  ) : null
                ) : itemSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Supabase URLs
                  <img
                    src={itemSrc}
                    alt={item.caption || `Related image ${i + 1}`}
                    className="fc-imagery-image fc-protected-img"
                    loading="lazy"
                    draggable={false}
                  />
                ) : null}
              </div>
              <div className="fc-imagery-metadata">
                <div className="fc-imagery-meta-row">
                  <span className="fc-imagery-type-icon">
                    {itemIsVideo ? <Video size={14} /> : <ImageIcon size={14} />}
                  </span>
                  <span className="fc-imagery-counter">
                    {i + 1} of {data.length}
                  </span>
                </div>
                {renderItemMeta(item, i)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop: horizontal strip of all images (hidden ≤720px via CSS) ── */}
      <div className="fc-imagery-desktop-carousel">
        {/* Horizontal scrollable strip — all images visible, no crop */}
        <div className="fc-imagery-hstrip">
          {data.map((item, i) => {
            const itemSrc = getMediaSrc(item);
            const itemIsVideo = isVideoItem(item);
            const isSelected = i === safeIndex;

            return (
              <button
                key={item.id || i}
                type="button"
                className={`fc-imagery-hstrip-item ${isSelected ? "fc-imagery-hstrip-item--active" : ""}`}
                onClick={() => setCurrentIndex(i)}
                aria-label={item.caption || `Related image ${i + 1}`}
                aria-current={isSelected || undefined}
              >
                {itemIsVideo ? (
                  itemSrc ? (
                    <div className="fc-imagery-video-container">
                      <video
                        src={itemSrc}
                        playsInline
                        muted
                        preload="metadata"
                        className="fc-imagery-hstrip-media"
                      >
                        {item.mimeType && <source src={itemSrc} type={item.mimeType} />}
                      </video>
                      <div className="fc-imagery-video-overlay">
                        <Play size={20} />
                      </div>
                    </div>
                  ) : null
                ) : itemSrc ? (
                  <img
                    src={itemSrc}
                    alt={item.caption || `Related image ${i + 1}`}
                    className="fc-imagery-hstrip-media fc-protected-img"
                    loading="lazy"
                    draggable={false}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Video player for selected video item */}
        {isVideo && src && (
          <div className="fc-imagery-video-player">
            <video
              key={src}
              src={src}
              controls
              playsInline
              preload="metadata"
              aria-label={currentItem.caption || "Related video"}
              className="fc-imagery-video-player__video"
            >
              {currentItem.mimeType && <source src={src} type={currentItem.mimeType} />}
            </video>
          </div>
        )}

        {/* Metadata for selected item */}
        <div className="fc-imagery-metadata" aria-live="polite">
          <div className="fc-imagery-meta-row">
            <span className="fc-imagery-type-icon">
              {isVideo ? <Video size={14} /> : <ImageIcon size={14} />}
            </span>
            <span className="fc-imagery-counter">
              {safeIndex + 1} of {data.length}
            </span>
            {/* Gallery button */}
            <button
              className="fc-imagery-gallery-btn"
              onClick={(e) => {
                e.stopPropagation();
                openFullGallery();
              }}
              aria-label="Open full gallery view"
            >
              <Maximize2 size={14} />
              <span>Gallery</span>
            </button>
          </div>
          {renderItemMeta(currentItem, safeIndex)}
        </div>
      </div>

      {/* Full Gallery Overlay - component uses portal internally */}
      <FCFullGallery
        data={data}
        isOpen={isFullGallery}
        initialIndex={safeIndex}
        onClose={closeFullGallery}
        onBackToCorner={closeFullGallery}
        mainImageSrc={mainImageSrc}
        projectContext={projectContext}
        readOnly={readOnly}
      />
    </div>
  );
}
