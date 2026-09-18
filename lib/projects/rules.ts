/**
 * Visibility and lineage rules. Pure, so every adapter enforces the same
 * behaviour the database used to enforce with constraints and triggers.
 *
 * Visibility states (docs/OBJECT-MODEL.md):
 *   private  published=false in_gallery=false
 *   link     published=true  in_gallery=false
 *   gallery  published=true  in_gallery=true
 * `in_gallery` implies `published`; unpublishing clears the gallery flag.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { GalleryLimitError } from "@/lib/ports/errors";
import type { ProjectDocument, ProjectId, UserId } from "./types";

export const GALLERY_LIMIT_REACHED = "GALLERY_LIMIT_REACHED";

export interface VisibilityChange {
  published?: boolean;
  inGallery?: boolean;
}

export interface VisibilityContext {
  /** How many OTHER projects this owner already has in the gallery. */
  otherInGalleryCount: number;
  /** Per-owner gallery cap; null means unlimited. */
  galleryLimit: number | null;
}

/**
 * Apply a visibility change to a document, or throw when a rule blocks it.
 * Adding to the gallery publishes the project — the two flags can never
 * disagree in the stored document.
 */
export function applyVisibilityChange(
  doc: ProjectDocument,
  change: VisibilityChange,
  ctx: VisibilityContext,
): ProjectDocument {
  let published = change.published ?? doc.published;
  let inGallery = change.inGallery ?? doc.inGallery;

  // Asking for the gallery implies publishing; unpublishing always withdraws.
  if (change.inGallery === true) published = true;
  if (!published) inGallery = false;

  if (inGallery && !doc.inGallery && ctx.galleryLimit !== null) {
    if (ctx.otherInGalleryCount >= ctx.galleryLimit) {
      throw new GalleryLimitError(ctx.galleryLimit);
    }
  }

  if (published === doc.published && inGallery === doc.inGallery) return doc;
  return { ...doc, published, inGallery };
}

/** Root of a lineage: the first project a chain or fork descends from. */
export function lineageRootId(doc: ProjectDocument): ProjectId {
  return doc.lineage.parentProjectId ?? doc.id;
}

export function nextVersionNumber(maxVersionInLineage: number): number {
  return maxVersionInLineage + 1;
}

/** A copy of someone else's project is a fork; a copy of your own is a version. */
export function forkFields(
  source: ProjectDocument,
  copierId: UserId,
): Pick<ProjectDocument["lineage"], "forkedFromUserId" | "isFork"> {
  const isFork = source.ownerId !== copierId;
  return { isFork, forkedFromUserId: isFork ? source.ownerId : null };
}
