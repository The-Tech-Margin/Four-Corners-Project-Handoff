/**
 * Local project repository: documents in a JSON collection.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/ports/errors";
import type { ProjectRepository, UpdateContext } from "@/lib/ports/projects";
import type {
  GalleryQuery,
  Page,
  ProjectDocument,
  ProjectId,
  UserId,
} from "@/lib/projects/types";
import { JsonStore } from "./json-store";

const byNewest = (a: ProjectDocument, b: ProjectDocument) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

export function createLocalProjectRepository(dataDir: string): ProjectRepository {
  const store = new JsonStore<ProjectDocument>(dataDir, "projects");

  const galleryDocs = (): ProjectDocument[] =>
    store.read().filter((doc) => doc.published && doc.inGallery);

  function countOthersInGallery(rows: ProjectDocument[], ownerId: UserId, excludeId?: ProjectId) {
    return rows.filter(
      (doc) => doc.ownerId === ownerId && doc.inGallery && doc.id !== excludeId,
    ).length;
  }

  return {
    async getById(id) {
      return store.read().find((doc) => doc.id === id) ?? null;
    },

    async getBySlug(slug) {
      return store.read().find((doc) => doc.slug === slug) ?? null;
    },

    async listByOwner(ownerId: UserId, page: Page) {
      return store
        .read()
        .filter((doc) => doc.ownerId === ownerId)
        .sort(byNewest)
        .slice(page.offset, page.offset + page.limit);
    },

    async listGallery(query: GalleryQuery) {
      const rows = galleryDocs()
        .filter((doc) => (query.tag ? doc.tags.includes(query.tag) : true))
        .sort(byNewest);
      if (query.sort === "oldest") rows.reverse();
      return rows.slice(query.offset, query.offset + query.limit);
    },

    async listGalleryAll() {
      return galleryDocs().sort(byNewest);
    },

    async listChildren(parentId, opts) {
      return store
        .read()
        .filter((doc) => doc.lineage.parentProjectId === parentId)
        .filter((doc) => (opts.publicOnly ? doc.published && doc.inGallery : true))
        .sort(byNewest);
    },

    async listSitemapEntries(limit) {
      return galleryDocs()
        .filter((doc) => !!doc.slug)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, limit)
        .map((doc) => ({ slug: doc.slug as string, updatedAt: doc.updatedAt }));
    },

    async countOwnerGalleryProjects(ownerId, excludeId) {
      return countOthersInGallery(store.read(), ownerId, excludeId);
    },

    async maxVersionInLineage(ownerId, rootId) {
      const versions = store
        .read()
        .filter(
          (doc) =>
            doc.ownerId === ownerId &&
            (doc.id === rootId || doc.lineage.parentProjectId === rootId),
        )
        .map((doc) => doc.lineage.versionNumber);
      return versions.length ? Math.max(...versions) : 0;
    },

    async findTranscriptionTextByAudioKey(ownerId, audioKey) {
      for (const doc of store.read()) {
        if (doc.ownerId !== ownerId) continue;
        const hit = (doc.metadata.voiceTranscriptions ?? []).find(
          (voice) => voice.audioStoragePath === audioKey,
        );
        if (hit?.text) return hit.text;
      }
      return null;
    },

    async insert(doc) {
      return store.mutate((rows) => {
        if (doc.slug && rows.some((row) => row.slug === doc.slug)) {
          throw new ConflictError(`The name "${doc.slug}" is taken.`, "SLUG_TAKEN");
        }
        return { rows: [...rows, doc], result: doc };
      });
    },

    async update(id, ownerId, updater) {
      return store.mutate((rows) => {
        const index = rows.findIndex((row) => row.id === id);
        if (index === -1) throw new NotFoundError("Project");

        const current = rows[index];
        if (current.ownerId !== ownerId) throw new ForbiddenError("this project");

        const ctx: UpdateContext = {
          otherInGalleryCount: countOthersInGallery(rows, ownerId, id),
        };
        const updated = updater(current, ctx);

        if (
          updated.slug &&
          rows.some((row) => row.id !== id && row.slug === updated.slug)
        ) {
          throw new ConflictError(`The name "${updated.slug}" is taken.`, "SLUG_TAKEN");
        }

        const next = [...rows];
        next[index] = updated;
        return { rows: next, result: updated };
      });
    },

    async delete(id, ownerId) {
      return store.mutate((rows) => {
        const target = rows.find((row) => row.id === id);
        if (!target) return { rows, result: false };
        if (target.ownerId !== ownerId) throw new ForbiddenError("this project");
        return { rows: rows.filter((row) => row.id !== id), result: true };
      });
    },
  };
}
