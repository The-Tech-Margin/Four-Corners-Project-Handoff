"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown, Loader2 } from "lucide-react";
import { encodeProjectId } from "@/lib/encode-id";
import { sizedImageUrl, THUMB_WIDTH, THUMB_QUALITY } from "@/lib/image-url";
import { FCVoiceNote } from "@/components/fc-voice-note";
import type { FourCornersMetadataExtended, VoiceTranscription } from "@/lib/schema";

/** Extended context item with extra DB-level fields that may be present */
interface ContextItemProps {
  id: string;
  sourceType?: string;
  type?: string;
  media_type?: string;
  caption?: string;
  description?: string;
  credit?: string;
  date?: string;
  filename?: string;
  title?: string;
  mimeType?: string;
  url?: string;
  src?: string;
  storage_url?: string;
  thumbnail_storage_url?: string;
  thumbnailDataUrl?: string;
  linkedProjectSlug?: string;
  audioStoragePath?: string;
  audioStorageUrl?: string;
  audioDataUrl?: string;
  audioMimeType?: string;
  audioDuration?: number;
}

interface ContextImageMetadata extends FourCornersMetadataExtended {
  voiceTranscriptions?: VoiceTranscription[];
}

/**
 * Context image/video card used in both grid and list views on the view page.
 * Handles media display, captions, audio playback, and voice transcriptions.
 */
export function ContextImageCard({
  item,
  index,
  metadata,
  layout,
  onImageClick,
}: {
  item: ContextItemProps;
  index: number;
  metadata: ContextImageMetadata;
  layout: "grid" | "list";
  onImageClick: () => void;
}) {
  const itemTranscriptions = (metadata.voiceTranscriptions || []).filter(
    (t: VoiceTranscription) => {
      const fieldId = t.fieldId;
      return (
        fieldId === `context-${item.id}` ||
        fieldId === `context-desc-${item.id}` ||
        fieldId === item.id ||
        fieldId === `context-image-caption-${index}` ||
        fieldId === `context-image-description-${index}`
      );
    },
  );

  const isVideo = item.type === "video" || item.media_type === "video" || (item.mimeType || "").startsWith("video/");
  const videoThumb = item.thumbnail_storage_url || item.thumbnailDataUrl;
  const videoSrc = isVideo ? (item.storage_url || item.url || item.src) : undefined;
  const fullImageSrc = isVideo
    ? undefined
    : item.storage_url || item.url || item.src || item.thumbnail_storage_url || item.thumbnailDataUrl;
  // Cards show a thumbnail (originals run to many MB and compete with the
  // main photograph's download); the lightbox still opens the full file.
  const thumbImageSrc = isVideo
    ? undefined
    : item.thumbnail_storage_url ||
      item.thumbnailDataUrl ||
      sizedImageUrl(fullImageSrc, { width: THUMB_WIDTH, quality: THUMB_QUALITY }) ||
      fullImageSrc;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [useFullFallback, setUseFullFallback] = useState(false);
  const imageSrc = useFullFallback ? fullImageSrc : thumbImageSrc;
  const hasAudio = !!(item.audioStorageUrl || item.audioDataUrl);
  const hasTranscriptions = itemTranscriptions.length > 0;
  const hasLinkedProject = !!item.linkedProjectSlug;

  // Expandable text block — clamps at 4 lines with show more/less toggle
  const ExpandableText = ({ text, className }: { text: string; className?: string }) => {
    const [expanded, setExpanded] = useState(false);
    const [clamped, setClamped] = useState(false);
    const textRef = useRef<HTMLParagraphElement>(null);

    useEffect(() => {
      const el = textRef.current;
      if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
    }, [text]);

    return (
      <div className="fc-context-meta__expandable">
        <p
          ref={textRef}
          className={`${className || ""} ${expanded ? "" : "fc-context-meta__text--clamped"}`}
        >
          {text}
        </p>
        {(clamped || expanded) && (
          <button
            type="button"
            className="fc-context-meta__expand-btn"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            <span>{expanded ? "Collapse" : "Expand"}</span>
          </button>
        )}
      </div>
    );
  };

  // Shared metadata block used in both layouts
  const renderMetadata = (compact?: boolean) => (
    <div className={compact ? "fc-context-meta fc-context-meta--compact" : "fc-context-meta"}>
      {item.caption && (
        <>
          <div className="fc-context-meta__audio-label">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span>Caption</span>
          </div>
          <ExpandableText text={item.caption} className="fc-context-meta__caption" />
        </>
      )}
      {item.description && item.description !== item.caption && (
        <>
          <div className="fc-context-meta__audio-label">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            <span>Description</span>
          </div>
          <ExpandableText text={item.description} className="fc-context-meta__description" />
        </>
      )}
      {item.credit && (
        <p className="fc-context-meta__credit">Credit: {item.credit}</p>
      )}
      {(item.date || item.mimeType || item.type === "video") && (
        <div className="fc-context-meta__file-row">
          {item.mimeType && (
            <span className="fc-context-meta__type">{item.mimeType}</span>
          )}
          {item.date && (
            <span className="fc-context-meta__date">{item.date}</span>
          )}
          {item.type === "video" && (
            <span className="fc-context-meta__badge fc-context-meta__badge--video">Video</span>
          )}
        </div>
      )}
      {hasLinkedProject && (
        <Link
          href={`/view/${encodeProjectId(item.linkedProjectSlug!)}`}
          className="fc-context-meta__link"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Linked Four Corners project
        </Link>
      )}
      {hasAudio && (
        <div className="fc-context-meta__audio">
          <div className="fc-context-meta__audio-label">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span>Audio recording</span>
            {item.audioDuration && (
              <span className="fc-context-meta__duration">
                {Math.floor(item.audioDuration / 60)}:{String(Math.floor(item.audioDuration % 60)).padStart(2, "0")}
              </span>
            )}
          </div>
          <div className="fc-context-meta__player-wrap">
            <audio
              controls
              className="fc-context-meta__player"
              src={item.audioStorageUrl || item.audioDataUrl}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
      {hasTranscriptions && (
        <div className="fc-context-meta__transcriptions" onClick={(e) => e.stopPropagation()}>
          <FCVoiceNote
            transcriptions={itemTranscriptions}
            clipClassName="fc-context-meta__transcription"
            renderLabel={() => (
              <div className="fc-context-meta__audio-label">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <span>Voice transcription</span>
              </div>
            )}
            renderText={(text) => (
              <ExpandableText text={text} className="fc-context-meta__transcription-text" />
            )}
          />
        </div>
      )}
    </div>
  );

  const renderImage = (isThumb?: boolean) => (
    <div
      className={isThumb ? "fc-context-card__thumb" : "fc-context-card__image"}
      onClick={isVideo ? undefined : onImageClick}
      onKeyDown={
        isVideo
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onImageClick();
              }
            }
      }
      role={isVideo ? undefined : "button"}
      tabIndex={isVideo ? undefined : 0}
      aria-label={isVideo ? undefined : `View ${item.caption || item.filename || `image ${index + 1}`}`}
    >
      {isVideo && videoSrc ? (
        <video
          src={videoSrc}
          poster={videoThumb || undefined}
          controls
          playsInline
          preload="metadata"
          className="w-full h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      ) : isVideo && videoThumb ? (
        <div className="fc-context-card__video-thumb" aria-label={`Video preview: ${item.caption || item.filename || `video ${index + 1}`} — playback unavailable`}>
          <img src={videoThumb} alt={item.caption || `Video ${index + 1}`} className="w-full h-full object-contain fc-protected-img" draggable={false} />
          <div className="fc-context-card__play-overlay">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="rgba(0,0,0,0.5)" /><path d="M16 12l12 8-12 8V12z" fill="white" /></svg>
          </div>
        </div>
      ) : isVideo ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2 p-4 text-center">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <div className="text-xs">Video unavailable</div>
          {item.filename && <div className="text-xs opacity-70 truncate max-w-full">{item.filename}</div>}
        </div>
      ) : imageSrc && !imageFailed ? (
        <>
          <img
            src={imageSrc}
            alt={item.caption || `Related image ${index + 1}`}
            className={isThumb ? "w-full h-full object-contain fc-protected-img" : "w-full h-full object-contain hover:scale-[1.02] transition-transform duration-200 fc-protected-img"}
            draggable={false}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              if (!useFullFallback && fullImageSrc && thumbImageSrc !== fullImageSrc) {
                setUseFullFallback(true); // render endpoint unavailable — original
              } else {
                setImageFailed(true);
              }
            }}
          />
          {!imageLoaded && (
            <div className="fc-card__loading" aria-hidden="true">
              <Loader2 className="animate-spin" size={20} />
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-600">
          <svg className={isThumb ? "w-8 h-8" : "w-12 h-12"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
    </div>
  );

  if (layout === "list") {
    return (
      <div className="fc-context-card fc-context-card--list">
        {renderImage(true)}
        <div className="fc-context-card__content">
          {renderMetadata(true)}
        </div>
      </div>
    );
  }

  return (
    <div className="fc-context-card">
      {renderImage(false)}
      <div className="fc-context-card__body">
        {renderMetadata(false)}
      </div>
    </div>
  );
}
