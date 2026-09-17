"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import type { ProjectRecord } from "@/lib/db/projects";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { encodeProjectId } from "@/lib/encode-id";
import { isVideoUrl } from "@/lib/media-utils";
import Link from "next/link";
import {
  Eye,
  Pencil,
  Trash2,
  Share2,
  Globe,
  Lock,
  Link2,
  Download,
  FileDown,
  Loader2,
} from "lucide-react";

export interface FCProjectCardProps {
  project: ProjectRecord;
  // Display options (for gallery customization)
  showCaption?: boolean;
  showBackstory?: boolean;
  showAuthor?: boolean;
  showDate?: boolean;
  showCornerIndicators?: boolean;
  // Interaction
  onClick?: () => void;
  href?: string;
  // Mode
  mode: "gallery" | "dashboard";
  onView?: (project: ProjectRecord) => void;
  onEdit?: (project: ProjectRecord) => void;
  onDelete?: (project: ProjectRecord) => void;
  onShare?: (project: ProjectRecord) => void;
  onDownload?: (project: ProjectRecord) => void;
  onExport4C?: (project: ProjectRecord) => void;
  isDeleting?: boolean;
  /** Eager-load with high fetch priority. Set on above-the-fold cards
   *  so the LCP image isn't held back. */
  priorityImage?: boolean;
}

/**
 * Unified project card with Four Corners viewer integration.
 * Used in both Gallery (public) and Dashboard (authenticated) views.
 */
export const FCProjectCard = memo(function FCProjectCard({
  project,
  showCaption = true,
  // showBackstory / showDate are part of the public prop API but are no
  // longer rendered in either mode — kept optional so existing callers that
  // still pass them don't type-error.
  showBackstory: _showBackstory = false, // eslint-disable-line @typescript-eslint/no-unused-vars
  showAuthor = true,
  showDate: _showDate = true, // eslint-disable-line @typescript-eslint/no-unused-vars
  showCornerIndicators = true,
  onClick,
  href,
  mode,
  onView,
  onEdit,
  onDelete,
  onShare,
  onDownload,
  onExport4C,
  isDeleting = false,
  priorityImage = false,
}: FCProjectCardProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const handleImageLoaded = useCallback(() => setImageLoaded(true), []);
  const handleImageFailed = useCallback(() => setImageFailed(true), []);

  // Stable per-card handlers so React.memo can skip re-renders during search.
  const handleView = useCallback(() => onView?.(project), [onView, project]);
  const handleEdit = useCallback(() => onEdit?.(project), [onEdit, project]);
  const handleDelete = useCallback(() => onDelete?.(project), [onDelete, project]);
  const handleShare = useCallback(() => onShare?.(project), [onShare, project]);
  const handleDownload = useCallback(() => onDownload?.(project), [onDownload, project]);
  const handleExport4C = useCallback(() => onExport4C?.(project), [onExport4C, project]);

  // Corners appear 300ms after image loads — image eases in first, then corners reveal
  const [cornersReady, setCornersReady] = useState(false);
  useEffect(() => {
    if (!imageLoaded) return;
    const timer = setTimeout(() => setCornersReady(true), 300);
    return () => clearTimeout(timer);
  }, [imageLoaded]);
  const metadata = project.metadata ?? ({} as FourCornersMetadataExtended);

  // Generate link slug
  const linkSlug =
    project.slug && project.slug.trim() ? project.slug : project.id;
  const encodedSlug = encodeProjectId(linkSlug);
  const cardHref = href || `/view/${encodedSlug}`;

  // Extract photographer/author name from all possible sources
  const getAuthorName = (): string => {
    // 1. Try copyright string — "CC BY 4.0 — Name" or plain "Name" for ARR
    const copyright = metadata.creativeCommons?.copyright || "";
    if (copyright) {
      const dashMatch = copyright.match(/—\s*(.+)$/);
      if (dashMatch?.[1]?.trim()) return dashMatch[1].trim();
      // ARR: the copyright IS the photographer name (no CC prefix)
      if (!copyright.includes("CC") && !copyright.includes("Public Domain")) {
        // Handle legacy "Photograph by Name ©" format
        const legacyMatch = copyright.match(/^Photograph by (.+?)( ©|$)/);
        if (legacyMatch?.[1]?.trim()) return legacyMatch[1].trim();
        if (copyright.trim()) return copyright.trim();
      }
    }
    // 2. Top-level author column from DB
    if (project.author?.trim()) return project.author.trim();
    // 3. Backstory author
    if (metadata.backStory?.author?.trim()) return metadata.backStory.author.trim();
    // 4. Photographer info contact/bio as last resort
    if (metadata.photographerInfo?.contact?.trim()) return metadata.photographerInfo.contact.trim();
    return "Anonymous";
  };

  const authorName = getAuthorName();

  // Build caption from metadata
  const getCaption = () => {
    const parts: string[] = [];

    // Camera info
    const eq = metadata.photoMetadata?.equipment;
    if (eq) {
      if (eq.cameraMake || eq.cameraModel) {
        parts.push([eq.cameraMake, eq.cameraModel].filter(Boolean).join(" "));
      }

      const settings: string[] = [];
      if (eq.focalLength) settings.push(eq.focalLength);
      if (eq.aperture) settings.push(eq.aperture);
      if (eq.shutterSpeed) settings.push(eq.shutterSpeed);
      if (eq.iso) settings.push(`ISO ${eq.iso}`);

      if (settings.length > 0) {
        parts.push(`(${settings.join(", ")})`);
      }
    }

    return parts.length > 0 ? parts.join(" ") : null;
  };

  const cameraCaption = getCaption();

  // Prefer the smaller thumbnail; fall back to the full image for legacy rows.
  const fullImageUrl = project.main_image_url ?? null;
  const isVideo = fullImageUrl ? isVideoUrl(fullImageUrl) : false;
  const coverSrc = !isVideo
    ? (project.main_image_thumbnail_url || fullImageUrl)
    : fullImageUrl;

  // The slug is a URL identifier derived from the title (lowercase, dashes
  // replacing spaces/punctuation) — it must NEVER be rendered as a label.
  const titleText = project.title?.trim() || "Untitled";

  // Check which corners have content for indicators
  const hasAuthorship = Boolean(
    metadata.creativeCommons?.description ||
    metadata.creativeCommons?.copyright ||
    metadata.ethics ||
    metadata.photographerInfo,
  );
  const hasBackstory = Boolean(
    metadata.backStory?.text || metadata.backStory?.author || metadata.backStory?.publication,
  );
  const hasImagery = (metadata.context || []).length > 0;
  const hasLinks = (metadata.links || []).length > 0;

  const cardContent = (
    <div
      className={`fc-card group${mode === "gallery" ? " fc-card--gallery" : ""}`}
    >
      {/* Image with Four Corners */}
      <div className="fc-card__image-container">
        {coverSrc && !imageFailed ? (
          mode === "gallery" ? (
            /* Gallery: lightweight card for both mobile + desktop — tap navigates to detail view */
            <div
              className={`fc-card__image-inner${cornersReady ? " fc-corners-visible" : ""}`}
              onClick={() => router.push(cardHref)}
              style={{ cursor: "pointer" }}
            >
              {isVideo ? (
                <video
                  src={coverSrc}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                  onLoadedMetadata={handleImageLoaded}
                  onError={handleImageFailed}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URLs, fidelity-critical photography
                <img
                  src={coverSrc}
                  alt={metadata.creativeCommons?.description || titleText || "Project image"}
                  draggable={false}
                  loading={priorityImage ? "eager" : "lazy"}
                  fetchPriority={priorityImage ? "high" : "auto"}
                  decoding="async"
                  className="fc-card-img fc-protected-img w-full h-full object-cover"
                  onLoad={handleImageLoaded}
                  onError={handleImageFailed}
                />
              )}
              {!imageLoaded && !imageFailed && (
                <div className="fc-card__loading" aria-hidden="true">
                  <Loader2 className="animate-spin" size={20} />
                </div>
              )}
              {showCornerIndicators && (
                <>
                  {hasAuthorship && <div className="fc-corner fc-corner--authorship fc-corner--disabled" aria-hidden="true" />}
                  {hasBackstory && <div className="fc-corner fc-corner--backstory fc-corner--disabled" aria-hidden="true" />}
                  {hasImagery && <div className="fc-corner fc-corner--imagery fc-corner--disabled" aria-hidden="true" />}
                  {hasLinks && <div className="fc-corner fc-corner--links fc-corner--disabled" aria-hidden="true" />}
                </>
              )}
            </div>
          ) : (
            /* Dashboard mode: plain image with decorative corners */
            <div className={`fc-card__image-inner${cornersReady ? " fc-corners-visible" : ""}`}>
              {isVideo ? (
                <video
                  src={coverSrc}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                  onLoadedMetadata={handleImageLoaded}
                  onError={handleImageFailed}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URLs, fidelity-critical photography
                <img
                  src={coverSrc}
                  alt={metadata.creativeCommons?.description || titleText || "Project image"}
                  draggable={false}
                  loading={priorityImage ? "eager" : "lazy"}
                  fetchPriority={priorityImage ? "high" : "auto"}
                  decoding="async"
                  className="fc-card-img fc-protected-img w-full h-full object-cover"
                  onLoad={handleImageLoaded}
                  onError={handleImageFailed}
                />
              )}
              {!imageLoaded && !imageFailed && (
                <div className="fc-card__loading" aria-hidden="true">
                  <Loader2 className="animate-spin" size={20} />
                </div>
              )}
              {showCornerIndicators && (
                <>
                  {hasImagery && <div className="fc-corner fc-corner--imagery fc-corner--disabled" aria-hidden="true" />}
                  {hasLinks && <div className="fc-corner fc-corner--links fc-corner--disabled" aria-hidden="true" />}
                  {hasBackstory && <div className="fc-corner fc-corner--backstory fc-corner--disabled" aria-hidden="true" />}
                  {hasAuthorship && <div className="fc-corner fc-corner--authorship fc-corner--disabled" aria-hidden="true" />}
                </>
              )}
            </div>
          )
        ) : (
          <div className="fc-card__placeholder">
            <svg
              className="w-12 h-12 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Deleting overlay */}
        {isDeleting && (
          <div className="fc-card__deleting-overlay">
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Dashboard: Controls bar outside image */}
      {mode === "dashboard" && (
        <div className="fc-card__controls">
          {/* Status badge - matches list view pill style */}
          <span
            className={`fc-card__status-badge ${
              project.in_gallery
                ? "fc-card__status-badge--public"
                : project.published
                  ? "fc-card__status-badge--shared"
                  : "fc-card__status-badge--private"
            }`}
          >
            {project.in_gallery ? (
              <>
                <Globe size={12} />
                <span>Public</span>
              </>
            ) : project.published ? (
              <>
                <Link2 size={12} />
                <span>Shared</span>
              </>
            ) : (
              <>
                <Lock size={12} />
                <span>Private</span>
              </>
            )}
          </span>

          {/* Action menu */}
          <div className="fc-card__menu-container">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              disabled={isDeleting}
              className="fc-card__menu-btn"
              aria-label="Actions menu"
              aria-expanded={showMenu}
            >
              {isDeleting ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                </svg>
              )}
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <>
                <div
                  className="fc-card__menu-backdrop"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowMenu(false);
                  }}
                />
                <div
                  className="fc-card__menu-dropdown"
                >
                  {onView && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        handleView();
                      }}
                      className="fc-card__menu-item"
                    >
                      <Eye size={16} />
                      <span>View</span>
                    </button>
                  )}
                  {onEdit && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        handleEdit();
                      }}
                      className="fc-card__menu-item"
                    >
                      <Pencil size={16} />
                      <span>Edit</span>
                    </button>
                  )}
                  {onShare && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        handleShare();
                      }}
                      className="fc-card__menu-item"
                    >
                      <Share2 size={16} />
                      <span>Share</span>
                    </button>
                  )}
                  {onExport4C && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        handleExport4C();
                      }}
                      className="fc-card__menu-item"
                    >
                      <FileDown size={16} />
                      <span>Export 4C</span>
                    </button>
                  )}
                  {onDownload && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        handleDownload();
                      }}
                      className="fc-card__menu-item"
                    >
                      <Download size={16} />
                      <span>Download</span>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        handleDelete();
                      }}
                      className="fc-card__menu-item fc-card__menu-item--danger"
                    >
                      <Trash2 size={16} />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Metadata section */}
      <div className="fc-card__metadata">
        {/* Camera caption for dashboard */}
        {mode === "dashboard" && cameraCaption && (
          <p className="fc-card__camera-info">{cameraCaption}</p>
        )}

        {/* Caption — dashboard only; gallery grid uses the title block instead */}
        {mode === "dashboard" && showCaption && metadata.creativeCommons?.description && (
          <p className="fc-card__caption">
            {metadata.creativeCommons.description}
          </p>
        )}
        {/* Gallery grid: title / author+dots / short description — matches list view title cell */}
        {mode === "gallery" && (
          <Link
            href={cardHref}
            className="fc-card__title-block"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="fc-card__title" title={titleText}>
              {titleText}
            </span>
            <span className="fc-card__author-row">
              {showAuthor && (
                <span className="fc-card__author">{authorName}</span>
              )}
              {showCornerIndicators && (
                <span
                  className="fc-list__corner-dots"
                  title="Backstory · Context · Links · CC"
                >
                  <span
                    className={`fc-list__corner-dot fc-list__corner-dot--bs${hasBackstory ? "" : " fc-list__corner-dot--empty"}`}
                  />
                  <span
                    className={`fc-list__corner-dot fc-list__corner-dot--cx${hasImagery ? "" : " fc-list__corner-dot--empty"}`}
                  />
                  <span
                    className={`fc-list__corner-dot fc-list__corner-dot--lk${hasLinks ? "" : " fc-list__corner-dot--empty"}`}
                  />
                  <span
                    className={`fc-list__corner-dot fc-list__corner-dot--cc${hasAuthorship ? "" : " fc-list__corner-dot--empty"}`}
                  />
                </span>
              )}
            </span>
          </Link>
        )}
      </div>
    </div>
  );

  // Gallery mode - image click navigates, corners click separately
  if (mode === "gallery") {
    return cardContent;
  }

  // Clickable div for dashboard or custom onClick
  if (onClick) {
    return (
      <div
        className="fc-card-link"
        onClick={onClick}
        role="button"
        tabIndex={0}
      >
        {cardContent}
      </div>
    );
  }

  return cardContent;
});
