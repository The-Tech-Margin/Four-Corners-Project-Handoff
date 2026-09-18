/**
 * Project operations: the one place the visibility, quota and lineage rules
 * meet the storage ports. Route handlers call these; they never reach into a
 * repository directly.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { getServices } from "@/lib/adapters";
import { getConfig } from "@/lib/config/server-config";
import { FourCornersMetadataExtendedSchema } from "@/lib/field-registry";
import type { SessionUser } from "@/lib/ports/auth";
import { ForbiddenError, NotFoundError, PortError } from "@/lib/ports/errors";
import { collectBlobRefs } from "@/lib/projects/blob-refs";
import { normalizeForPersistence } from "@/lib/projects/normalize";
import { toListingRecord, toProjectRecord } from "@/lib/projects/projections";
import { applyVisibilityChange, forkFields, lineageRootId } from "@/lib/projects/rules";
import type {
  GalleryQuery,
  MainImageRef,
  Page,
  ProjectDocument,
  ProjectId,
  ProjectRecord,
  UserId,
} from "@/lib/projects/types";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { assertQuotaFor } from "./quota";

export interface SaveInput {
  metadata: FourCornersMetadataExtended;
  mainImage?: MainImageRef;
  slug?: string | null;
  title?: string | null;
  tags?: string[];
}

export interface SaveOutcome {
  project: ProjectRecord;
  warnings: string[];
}

function validateMetadata(metadata: unknown): FourCornersMetadataExtended {
  const result = FourCornersMetadataExtendedSchema.safeParse(metadata);
  if (!result.success) {
    const detail = result.error.errors
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "metadata"}: ${issue.message}`)
      .join("; ");
    throw new PortError(`Invalid project metadata — ${detail}`, "INVALID_METADATA");
  }
  return result.data as FourCornersMetadataExtended;
}

function galleryContext(otherInGalleryCount: number) {
  return { otherInGalleryCount, galleryLimit: getConfig().galleryLimitPerUser };
}

/** Index in the background: a save must not fail because search is slow. */
function reindex(doc: ProjectDocument): void {
  void getServices()
    .search.indexProject(doc)
    .catch((error) => console.error("search index failed", error));
}

export async function listForOwner(ownerId: UserId, page: Page): Promise<ProjectRecord[]> {
  const docs = await getServices().projects.listByOwner(ownerId, page);
  return docs.map(toListingRecord);
}

/** By id or slug. Private projects are visible to their owner only. */
export async function getForViewer(
  ref: string,
  viewer: SessionUser | null,
): Promise<ProjectRecord | null> {
  const { projects } = getServices();
  const doc = (await projects.getById(ref)) ?? (await projects.getBySlug(ref));
  if (!doc) return null;
  if (!doc.published && doc.ownerId !== viewer?.id) return null;
  return toProjectRecord(doc);
}

export async function getPublicBySlug(slug: string): Promise<ProjectRecord | null> {
  const doc = await getServices().projects.getBySlug(slug);
  if (!doc || !doc.published || !doc.inGallery) return null;
  return toProjectRecord(doc);
}

export async function listPublicChildren(slug: string): Promise<ProjectRecord[]> {
  const parent = await getServices().projects.getBySlug(slug);
  if (!parent || !parent.published || !parent.inGallery) return [];
  const children = await getServices().projects.listChildren(parent.id, { publicOnly: true });
  return children.map(toProjectRecord);
}

export async function listGallery(query: GalleryQuery): Promise<ProjectRecord[]> {
  const docs = await getServices().projects.listGallery(query);
  return docs.map(toListingRecord);
}

export async function createProject(
  owner: SessionUser,
  input: SaveInput & { parentProjectId?: ProjectId | null; publishToGallery?: boolean },
): Promise<SaveOutcome> {
  const metadata = validateMetadata(input.metadata);
  const normalized = normalizeForPersistence({
    metadata,
    mainImage: input.mainImage ?? null,
    ownerId: owner.id,
  });

  const now = new Date().toISOString();
  const warnings = [...normalized.warnings];
  const parentId = input.parentProjectId ?? null;

  let doc: ProjectDocument = {
    id: randomUUID(),
    ownerId: owner.id,
    slug: input.slug ?? null,
    title: input.title ?? null,
    metadata: normalized.metadata,
    mainImage: normalized.mainImage,
    published: false,
    inGallery: false,
    tags: input.tags ?? [],
    lineage: {
      parentProjectId: parentId,
      versionNumber: 1,
      forkedFromUserId: null,
      isFork: false,
    },
    createdAt: now,
    updatedAt: now,
  };

  // A project promoted out of a parent's context images goes straight to the
  // gallery, unless that would pass this owner's gallery limit.
  if (input.publishToGallery) {
    const otherInGallery = await getServices().projects.countOwnerGalleryProjects(owner.id);
    try {
      doc = applyVisibilityChange(
        doc,
        { published: true, inGallery: true },
        galleryContext(otherInGallery),
      );
    } catch {
      doc = { ...doc, published: true, inGallery: false };
      warnings.push("GALLERY_LIMIT_REACHED");
    }
  }

  const created = await getServices().projects.insert(doc);
  reindex(created);
  return { project: toProjectRecord(created), warnings };
}

export async function saveProject(
  owner: SessionUser,
  id: ProjectId,
  input: SaveInput,
): Promise<SaveOutcome> {
  const metadata = validateMetadata(input.metadata);
  const normalized = normalizeForPersistence({
    metadata,
    mainImage: input.mainImage,
    ownerId: owner.id,
  });

  const updated = await getServices().projects.update(id, owner.id, (current) => ({
    ...current,
    metadata: normalized.metadata,
    mainImage: input.mainImage === undefined ? current.mainImage : normalized.mainImage,
    slug: input.slug === undefined ? current.slug : input.slug,
    title: input.title === undefined ? current.title : input.title,
    tags: input.tags ?? current.tags,
    updatedAt: new Date().toISOString(),
  }));

  reindex(updated);
  return { project: toProjectRecord(updated), warnings: normalized.warnings };
}

export async function patchProject(
  owner: SessionUser,
  id: ProjectId,
  patch: { slug?: string; title?: string | null; tags?: string[] },
): Promise<ProjectRecord> {
  const updated = await getServices().projects.update(id, owner.id, (current) => ({
    ...current,
    slug: patch.slug ?? current.slug,
    title: patch.title === undefined ? current.title : patch.title,
    tags: patch.tags ?? current.tags,
    updatedAt: new Date().toISOString(),
  }));
  reindex(updated);
  return toProjectRecord(updated);
}

export async function setVisibility(
  owner: SessionUser,
  id: ProjectId,
  change: { published?: boolean; inGallery?: boolean },
): Promise<ProjectRecord> {
  const updated = await getServices().projects.update(id, owner.id, (current, ctx) => {
    const next = applyVisibilityChange(current, change, galleryContext(ctx.otherInGalleryCount));
    return next === current ? current : { ...next, updatedAt: new Date().toISOString() };
  });
  reindex(updated);
  return toProjectRecord(updated);
}

/**
 * Copy a project. Media is copied into the copier's own namespace rather
 * than referenced, so a fork never depends on someone else's private blobs.
 */
export async function duplicateProject(
  owner: SessionUser,
  id: ProjectId,
  input: { slug?: string | null; title?: string | null },
): Promise<ProjectRecord> {
  const { projects, blobs } = getServices();
  const source = await projects.getById(id);
  if (!source) throw new NotFoundError("Project");
  if (source.ownerId !== owner.id && !(source.published && source.inGallery)) {
    throw new ForbiddenError("this project");
  }

  const refs = collectBlobRefs(source);
  const totalBytes = (
    await Promise.all(refs.map((ref) => blobs.head(ref.bucket, ref.key)))
  ).reduce((sum, stat) => sum + (stat?.size ?? 0), 0);
  await assertQuotaFor(owner.id, totalBytes);

  const newId = randomUUID();
  const keyMap = new Map<string, string>();
  for (const ref of refs) {
    const copiedKey = ref.key.replace(
      `${source.ownerId}/`,
      `${owner.id}/`,
    ).replace(source.id, newId);
    await blobs.copy(ref.bucket, ref.key, copiedKey);
    keyMap.set(ref.key, copiedKey);
    const stat = await blobs.head(ref.bucket, copiedKey);
    await getServices().assets.record(owner.id, {
      mediaType: ref.bucket === "voice-recordings" ? "audio" : "image",
      mimeType: stat?.contentType ?? "application/octet-stream",
      fileName: copiedKey.split("/").pop() ?? copiedKey,
      bucket: ref.bucket,
      key: copiedKey,
      thumbnailKey: null,
      fileSize: stat?.size ?? null,
      width: null,
      height: null,
      duration: null,
    });
  }

  const remap = (key: string | undefined): string | undefined =>
    key ? (keyMap.get(key) ?? undefined) : undefined;

  const now = new Date().toISOString();
  const rootId = lineageRootId(source);
  const maxVersion = await projects.maxVersionInLineage(owner.id, rootId);

  const copy: ProjectDocument = {
    id: newId,
    ownerId: owner.id,
    slug: input.slug ?? null,
    title: input.title ?? (source.title ? `${source.title} copy` : null),
    metadata: {
      ...source.metadata,
      context: (source.metadata.context ?? []).map((item) => ({
        ...item,
        storage_path: remap(item.storage_path),
        thumbnail_storage_path: remap(item.thumbnail_storage_path),
        audioStoragePath: remap(item.audioStoragePath),
        storage_url: undefined,
        thumbnail_storage_url: undefined,
        audioStorageUrl: undefined,
        src: undefined,
      })),
      voiceTranscriptions: (source.metadata.voiceTranscriptions ?? []).map((voice) => ({
        ...voice,
        audioStoragePath: remap(voice.audioStoragePath),
        audioStorageUrl: undefined,
      })),
    },
    mainImage:
      source.mainImage?.kind === "blob"
        ? {
            kind: "blob",
            key: remap(source.mainImage.key) ?? source.mainImage.key,
            thumbnailKey: remap(source.mainImage.thumbnailKey ?? undefined) ?? null,
          }
        : source.mainImage,
    published: false,
    inGallery: false,
    tags: source.tags,
    lineage: {
      parentProjectId: rootId,
      versionNumber: maxVersion + 1,
      ...forkFields(source, owner.id),
    },
    createdAt: now,
    updatedAt: now,
  };

  const created = await projects.insert(copy);
  return toProjectRecord(created);
}

export async function deleteProject(owner: SessionUser, id: ProjectId): Promise<boolean> {
  const { projects, blobs, search } = getServices();
  const doc = await projects.getById(id);
  if (!doc) return false;
  if (doc.ownerId !== owner.id) throw new ForbiddenError("this project");

  const removed = await projects.delete(id, owner.id);
  if (removed) {
    for (const ref of collectBlobRefs(doc)) {
      await blobs.delete(ref.bucket, [ref.key]).catch(() => undefined);
    }
    await search.removeProject(id).catch(() => undefined);
  }
  return removed;
}
