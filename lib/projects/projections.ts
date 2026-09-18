/**
 * Read-side projections: a stored document becomes the ProjectRecord shape
 * the API, viewer and editor already speak. Derived URLs are rebuilt here
 * from blob keys, which is why they are never persisted.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { ContextItem, VoiceTranscription } from "@/lib/field-registry";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { blobUrl } from "@/lib/storage/blob-url";
import { bucketForKey } from "./blob-refs";
import type { ProjectDocument, ProjectRecord } from "./types";

/** Private objects need a grant; a published project is that grant. */
function urlForKey(key: string, doc: ProjectDocument, width?: number): string {
  const bucket = bucketForKey(key);
  const projectId = bucket === "context-media" ? undefined : doc.id;
  return blobUrl(bucket, key, { projectId, width });
}

function hydrateContextItem(item: ContextItem, doc: ProjectDocument): ContextItem {
  const next: ContextItem = { ...item };

  if (next.storage_path) {
    next.storage_url = urlForKey(next.storage_path, doc);
    next.src = next.storage_url;
  } else if (next.url && !next.src) {
    next.src = next.url;
  }

  if (next.thumbnail_storage_path) {
    next.thumbnail_storage_url = urlForKey(next.thumbnail_storage_path, doc);
  }

  if (next.audioStoragePath) {
    next.audioStorageUrl = urlForKey(next.audioStoragePath, doc);
  }

  return next;
}

function hydrateVoice(voice: VoiceTranscription, doc: ProjectDocument): VoiceTranscription {
  if (!voice.audioStoragePath) return { ...voice };
  return { ...voice, audioStorageUrl: urlForKey(voice.audioStoragePath, doc) };
}

function hydrateMetadata(doc: ProjectDocument): FourCornersMetadataExtended {
  return {
    ...doc.metadata,
    context: (doc.metadata.context ?? []).map((item) => hydrateContextItem(item, doc)),
    voiceTranscriptions: doc.metadata.voiceTranscriptions
      ? doc.metadata.voiceTranscriptions.map((voice) => hydrateVoice(voice, doc))
      : doc.metadata.voiceTranscriptions,
  };
}

function mainImageFields(doc: ProjectDocument): Pick<
  ProjectRecord,
  | "main_image_url"
  | "main_image_storage_path"
  | "main_image_thumbnail_url"
  | "main_image_thumbnail_path"
> {
  const image = doc.mainImage;
  if (!image) return {};
  if (image.kind === "url") return { main_image_url: image.url };

  return {
    main_image_url: urlForKey(image.key, doc),
    main_image_storage_path: image.key,
    main_image_thumbnail_path: image.thumbnailKey,
    main_image_thumbnail_url: image.thumbnailKey
      ? urlForKey(image.thumbnailKey, doc)
      : null,
  };
}

function baseRecord(doc: ProjectDocument): Omit<ProjectRecord, "metadata"> {
  return {
    id: doc.id,
    user_id: doc.ownerId,
    slug: doc.slug ?? undefined,
    title: doc.title ?? undefined,
    author: doc.metadata.backStory?.author || undefined,
    date: doc.metadata.backStory?.date || undefined,
    published: doc.published,
    in_gallery: doc.inGallery,
    parent_project_id: doc.lineage.parentProjectId ?? undefined,
    version_number: doc.lineage.versionNumber,
    forked_from_user_id: doc.lineage.forkedFromUserId ?? undefined,
    is_fork: doc.lineage.isFork,
    tags: doc.tags,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    ...mainImageFields(doc),
  };
}

/** Full record: every corner, hydrated. */
export function toProjectRecord(doc: ProjectDocument): ProjectRecord {
  return { ...baseRecord(doc), metadata: hydrateMetadata(doc) };
}

/**
 * Listing record for dashboards and gallery cards: the same wrapper, with a
 * metadata document trimmed to what a card renders.
 */
export function toListingRecord(doc: ProjectDocument): ProjectRecord {
  const metadata = hydrateMetadata(doc);
  return {
    ...baseRecord(doc),
    metadata: {
      backStory: metadata.backStory,
      creativeCommons: metadata.creativeCommons,
      context: (metadata.context ?? []).slice(0, 1),
      links: [],
      location: metadata.location,
      meta: metadata.meta,
    },
  };
}

export function toSitemapEntry(doc: ProjectDocument): { slug: string; updatedAt: string } {
  return { slug: doc.slug ?? "", updatedAt: doc.updatedAt };
}

/**
 * Make every app-hosted media URL absolute. Responses that leave this
 * deployment — the public API, IIIF manifests — need URLs a third party can
 * actually fetch.
 */
export function withAbsoluteMediaUrls(record: ProjectRecord, origin: string): ProjectRecord {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  const absolute = <T extends string | null | undefined>(url: T): T =>
    (typeof url === "string" && url.startsWith("/") ? `${base}${url}` : url) as T;

  return {
    ...record,
    main_image_url: absolute(record.main_image_url),
    main_image_thumbnail_url: absolute(record.main_image_thumbnail_url),
    metadata: {
      ...record.metadata,
      context: (record.metadata.context ?? []).map((item) => ({
        ...item,
        src: absolute(item.src),
        storage_url: absolute(item.storage_url),
        thumbnail_storage_url: absolute(item.thumbnail_storage_url),
        audioStorageUrl: absolute(item.audioStorageUrl),
      })),
      voiceTranscriptions: record.metadata.voiceTranscriptions?.map((voice) => ({
        ...voice,
        audioStorageUrl: absolute(voice.audioStorageUrl),
      })),
    },
  };
}
