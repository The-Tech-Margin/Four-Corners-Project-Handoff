/**
 * Domain types for a project. `ProjectDocument` is what a data adapter
 * persists; `ProjectRecord` is the shape every API response and component
 * already expects, produced by lib/projects/projections.ts.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { FourCornersMetadataExtended } from "@/lib/schema";

export type ProjectId = string;
export type UserId = string;

/** Media reference for the project's primary image. */
export type MainImageRef =
  | { kind: "blob"; key: string; thumbnailKey: string | null }
  /** External or legacy absolute URL — stored as-is, never re-hosted. */
  | { kind: "url"; url: string }
  | null;

export interface ProjectLineage {
  parentProjectId: ProjectId | null;
  versionNumber: number;
  forkedFromUserId: UserId | null;
  isFork: boolean;
}

/** The persisted aggregate: one document per project. */
export interface ProjectDocument {
  id: ProjectId;
  ownerId: UserId;
  slug: string | null;
  title: string | null;
  metadata: FourCornersMetadataExtended;
  mainImage: MainImageRef;
  published: boolean;
  inGallery: boolean;
  tags: string[];
  lineage: ProjectLineage;
  createdAt: string;
  updatedAt: string;
}

/**
 * Wire shape returned by the API and consumed by the viewer, gallery and
 * editor. Snake_case wrapper around a camelCase metadata document — kept
 * exactly as it was when rows came straight from Postgres.
 */
export interface ProjectRecord {
  id: string;
  user_id: string;
  slug?: string;
  title?: string;
  author?: string;
  date?: string;
  metadata: FourCornersMetadataExtended;
  main_image_url?: string;
  main_image_storage_path?: string;
  /** Public URL of the ≤400px aspect-preserving gallery thumbnail. */
  main_image_thumbnail_url?: string | null;
  /** Storage path of the gallery thumbnail in the same bucket as the main image. */
  main_image_thumbnail_path?: string | null;
  published: boolean;
  in_gallery: boolean;
  parent_project_id?: string;
  version_number?: number;
  forked_from_user_id?: string;
  is_fork?: boolean;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface Page {
  limit: number;
  offset: number;
}

export interface GalleryQuery extends Page {
  sort: "newest" | "oldest";
  tag?: string | null;
}
