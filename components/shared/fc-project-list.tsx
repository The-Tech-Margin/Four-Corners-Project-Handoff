"use client";

import { type ReactNode } from "react";
import type { ProjectRecord } from "@/lib/db/projects";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { isVideoUrl } from "@/lib/media-utils";
import { sizedImageUrl, THUMB_WIDTH, THUMB_QUALITY } from "@/lib/image-url";
import {
  Eye,
  Pencil,
  Trash2,
  Share2,
  MapPin,
  Camera,
  Calendar,
  Image as ImageIcon,
  Download,
  FileDown,
  Globe,
  Link2,
  Lock,
} from "lucide-react";

export interface FCProjectListProps {
  projects: ProjectRecord[];
  mode?: "gallery" | "dashboard";
  onView?: (project: ProjectRecord) => void;
  onEdit?: (project: ProjectRecord) => void;
  onDelete?: (project: ProjectRecord) => void;
  onShare?: (project: ProjectRecord) => void;
  onDownload?: (project: ProjectRecord) => void;
  onExport4C?: (project: ProjectRecord) => void;
  deletingId?: string | null;
  emptyState?: ReactNode;
}

/**
 * List view for projects - shows more metadata details in a compact format.
 * Gallery mode hides dashboard-only columns (status, edit/delete/share actions).
 */
export function FCProjectList({
  projects,
  mode = "dashboard",
  onView,
  onEdit,
  onDelete,
  onShare,
  onDownload,
  onExport4C,
  deletingId,
  emptyState,
}: FCProjectListProps) {
  const isGallery = mode === "gallery";
  if (projects.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const formatDate = (date: string) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className={`fc-list${isGallery ? " fc-list--gallery" : ""}`}>
      {/* Header */}
      <div className="fc-list__header">
        <div className="fc-list__header-cell fc-list__header-cell--image">
          Image
        </div>
        <div className="fc-list__header-cell fc-list__header-cell--title">
          {isGallery ? "Title / Author" : "Title / Description"}
        </div>
        <div className="fc-list__header-cell fc-list__header-cell--metadata">
          Metadata
        </div>
        {!isGallery && (
          <div className="fc-list__header-cell fc-list__header-cell--status">
            Status
          </div>
        )}
        <div className="fc-list__header-cell fc-list__header-cell--date">
          Date
        </div>
        <div className="fc-list__header-cell fc-list__header-cell--actions">
          {isGallery ? "" : "Actions"}
        </div>
      </div>

      {/* Rows */}
      <div className="fc-list__body" role="list">
        {projects.map((project) => {
          const metadata = project.metadata ?? ({} as FourCornersMetadataExtended);
          const isDeleting = deletingId === project.id;

          // Get location info
          const location = metadata.location;
          const locationString = [location?.city, location?.country]
            .filter(Boolean)
            .join(", ");

          // Get camera info
          const equipment = metadata.photoMetadata?.equipment;
          const cameraInfo = [equipment?.cameraMake, equipment?.cameraModel]
            .filter(Boolean)
            .join(" ");

          // Count context images
          const contextCount = metadata.context?.length || 0;

          // Corner completion — pure metadata checks, no extra queries
          const hasBS = Boolean(metadata.backStory?.text || metadata.backStory?.author || metadata.backStory?.publication);
          const hasCX = (metadata.context || []).length > 0;
          const hasLK = (metadata.links || []).length > 0;
          const hasCC = Boolean(metadata.creativeCommons?.copyright || metadata.creativeCommons?.description);

          // Get description
          const description =
            metadata.creativeCommons?.description ||
            metadata.backStory?.text ||
            "";

          // Get author — extract from copyright, fallback chain for existing files
          const extractAuthor = (): string => {
            const copyright = metadata.creativeCommons?.copyright || "";
            if (copyright) {
              const dashMatch = copyright.match(/—\s*(.+)$/);
              if (dashMatch?.[1]?.trim()) return dashMatch[1].trim();
              if (!copyright.includes("CC") && !copyright.includes("Public Domain")) {
                const legacyMatch = copyright.match(/^Photograph by (.+?)( ©|$)/);
                if (legacyMatch?.[1]?.trim()) return legacyMatch[1].trim();
                if (copyright.trim()) return copyright.trim();
              }
            }
            if (project.author?.trim()) return project.author.trim();
            if (metadata.backStory?.author?.trim()) return metadata.backStory.author.trim();
            return "";
          };
          const author = extractAuthor();

          return (
            <div
              key={project.id}
              role="listitem"
              className={`fc-list__row ${isDeleting ? "fc-list__row--deleting" : ""}`}
            >
              {/* Thumbnail — clickable: edit in dashboard, view in gallery */}
              <div
                className="fc-list__cell fc-list__cell--image"
                onClick={() => (!isGallery && onEdit ? onEdit(project) : onView?.(project))}
                style={onView || onEdit ? { cursor: "pointer" } : undefined}
              >
                {project.main_image_url ? (
                  isVideoUrl(project.main_image_url) ? (
                    <video
                      src={project.main_image_url}
                      muted
                      playsInline
                      preload="metadata"
                      className="fc-list__thumbnail"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = "none";
                        target.parentElement?.querySelector(".fc-list__placeholder")?.removeAttribute("hidden");
                      }}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URLs, fidelity-critical photography
                    <img
                      src={
                        project.main_image_thumbnail_url ||
                        sizedImageUrl(project.main_image_url, {
                          width: THUMB_WIDTH,
                          quality: THUMB_QUALITY,
                        }) ||
                        project.main_image_url
                      }
                      alt={description || project.title?.trim() || "Project image"}
                      className="fc-list__thumbnail"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        // Step back to the original before giving up — the
                        // render endpoint can be unavailable on some plans.
                        const target = e.currentTarget;
                        if (
                          project.main_image_url &&
                          target.src !== project.main_image_url
                        ) {
                          target.src = project.main_image_url;
                          return;
                        }
                        target.style.display = "none";
                        target.parentElement?.querySelector(".fc-list__placeholder")?.removeAttribute("hidden");
                      }}
                    />
                  )
                ) : null}
                <div className="fc-list__placeholder" hidden={!!project.main_image_url}>
                  <ImageIcon size={20} />
                </div>
              </div>

              {/* Title / Description — clickable: edit in dashboard, view in gallery */}
              <div
                className="fc-list__cell fc-list__cell--title"
                onClick={() => (!isGallery && onEdit ? onEdit(project) : onView?.(project))}
                style={onView || onEdit ? { cursor: "pointer" } : undefined}
              >
                <span className="fc-list__title-row">
                  <span className="fc-list__title">
                    {project.title?.trim() || "Untitled"}
                  </span>
                  {isGallery && author && (
                    <span className="fc-list__author">{author}</span>
                  )}
                  <span className="fc-list__corner-dots" title="Backstory · Context · Links · CC">
                    <span className={`fc-list__corner-dot fc-list__corner-dot--bs${hasBS ? "" : " fc-list__corner-dot--empty"}`} />
                    <span className={`fc-list__corner-dot fc-list__corner-dot--cx${hasCX ? "" : " fc-list__corner-dot--empty"}`} />
                    <span className={`fc-list__corner-dot fc-list__corner-dot--lk${hasLK ? "" : " fc-list__corner-dot--empty"}`} />
                    <span className={`fc-list__corner-dot fc-list__corner-dot--cc${hasCC ? "" : " fc-list__corner-dot--empty"}`} />
                  </span>
                </span>
                {description && (
                  <span className="fc-list__description">
                    {description.length > 80
                      ? `${description.slice(0, 80)}...`
                      : description}
                  </span>
                )}
              </div>

              {/* Metadata chips */}
              <div className="fc-list__cell fc-list__cell--metadata">
                {locationString && (
                  <span className="fc-list__chip">
                    <MapPin size={12} />
                    <span>{locationString}</span>
                  </span>
                )}
                {cameraInfo && (
                  <span className="fc-list__chip">
                    <Camera size={12} />
                    <span>{cameraInfo}</span>
                  </span>
                )}
                {contextCount > 0 && (
                  <span className="fc-list__chip">
                    <ImageIcon size={12} />
                    <span>{contextCount} related</span>
                  </span>
                )}
              </div>

              {/* Status - Private / Shared / Public (dashboard only) */}
              {!isGallery && (
                <div className="fc-list__cell fc-list__cell--status">
                  <span
                    className={`fc-list__badge ${
                      project.in_gallery
                        ? "fc-list__badge--public"
                        : project.published
                          ? "fc-list__badge--shared"
                          : "fc-list__badge--private"
                    }`}
                    title={
                      project.in_gallery
                        ? "Public (in gallery)"
                        : project.published
                          ? "Shared (link only)"
                          : "Private"
                    }
                  >
                    {project.in_gallery ? (
                      <>
                        <Globe size={12} /> Public
                      </>
                    ) : project.published ? (
                      <>
                        <Link2 size={12} /> Shared
                      </>
                    ) : (
                      <>
                        <Lock size={12} /> Private
                      </>
                    )}
                  </span>
                </div>
              )}

              {/* Date — prefer metadata dates over creation date */}
              <div className="fc-list__cell fc-list__cell--date">
                <span className="fc-list__date">
                  <Calendar size={12} />
                  {formatDate(
                    project.metadata?.photoMetadata?.dateTaken ||
                    project.metadata?.backStory?.date ||
                    project.date ||
                    project.created_at
                  )}
                </span>
              </div>

              {/* Actions */}
              <div className="fc-list__cell fc-list__cell--actions">
                {onView && (
                  <button
                    onClick={() => onView(project)}
                    disabled={isDeleting}
                    className={`fc-list__action fc-list__action--view${isGallery ? " fc-list__action--primary" : ""}`}
                    aria-label="View"
                  >
                    <Eye size={16} />
                  </button>
                )}
                {!isGallery && onEdit && (
                  <button
                    onClick={() => onEdit(project)}
                    disabled={isDeleting}
                    className="fc-list__action fc-list__action--edit"
                    aria-label="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                )}
                {onShare && (
                  <button
                    onClick={() => onShare(project)}
                    disabled={isDeleting}
                    className="fc-list__action fc-list__action--share"
                    aria-label="Share"
                  >
                    <Share2 size={16} />
                  </button>
                )}
                {!isGallery && onExport4C && (
                  <button
                    onClick={() => onExport4C(project)}
                    disabled={isDeleting}
                    className="fc-list__action fc-list__action--download"
                    aria-label="Export 4C"
                  >
                    <FileDown size={16} />
                  </button>
                )}
                {!isGallery && onDownload && (
                  <button
                    onClick={() => onDownload(project)}
                    disabled={isDeleting}
                    className="fc-list__action fc-list__action--download"
                    aria-label="Download"
                  >
                    <Download size={16} />
                  </button>
                )}
                {!isGallery && onDelete && (
                  <button
                    onClick={() => onDelete(project)}
                    disabled={isDeleting}
                    className="fc-list__action fc-list__action--delete"
                    aria-label="Delete"
                  >
                    {isDeleting ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                )}
              </div>

              {/* Deleting overlay */}
              {isDeleting && (
                <div className="fc-list__deleting-overlay">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
