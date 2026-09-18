/**
 * Project repository port. Storage only: the visibility, quota and lineage
 * rules live in lib/projects/rules.ts and lib/server/project-service.ts so
 * every adapter enforces the same behaviour.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type {
  GalleryQuery,
  Page,
  ProjectDocument,
  ProjectId,
  UserId,
} from "@/lib/projects/types";

export interface UpdateContext {
  /** Gallery projects this owner has, excluding the one being updated. */
  otherInGalleryCount: number;
}

export interface ProjectRepository {
  getById(id: ProjectId): Promise<ProjectDocument | null>;
  getBySlug(slug: string): Promise<ProjectDocument | null>;
  listByOwner(ownerId: UserId, page: Page): Promise<ProjectDocument[]>;
  /** Published and in-gallery, newest first unless the query says otherwise. */
  listGallery(query: GalleryQuery): Promise<ProjectDocument[]>;
  /** Every gallery document, for adapters that rank in process. */
  listGalleryAll(): Promise<ProjectDocument[]>;
  listChildren(parentId: ProjectId, opts: { publicOnly: boolean }): Promise<ProjectDocument[]>;
  listSitemapEntries(limit: number): Promise<{ slug: string; updatedAt: string }[]>;
  countOwnerGalleryProjects(ownerId: UserId, excludeId?: ProjectId): Promise<number>;
  maxVersionInLineage(ownerId: UserId, rootId: ProjectId): Promise<number>;
  findTranscriptionTextByAudioKey(ownerId: UserId, audioKey: string): Promise<string | null>;
  insert(doc: ProjectDocument): Promise<ProjectDocument>;
  /**
   * Read-modify-write under a per-document lock. The updater runs with the
   * current document, so rules see state nobody can change underneath them.
   */
  update(
    id: ProjectId,
    ownerId: UserId,
    updater: (current: ProjectDocument, ctx: UpdateContext) => ProjectDocument,
  ): Promise<ProjectDocument>;
  delete(id: ProjectId, ownerId: UserId): Promise<boolean>;
}
