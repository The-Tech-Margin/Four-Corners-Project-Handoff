/**
 * Project data transformations
 * Pure functions for converting between DB rows and ProjectRecord shapes.
 * No database calls — safe for use in any context.
 */

import type { FourCornersMetadataExtended } from "@/lib/schema";
import { FourCornersMetadataExtendedSchema } from "@/lib/field-registry";
import { secureMetadata } from "@/lib/security/sanitize";
import { renderImageUrl, THUMB_WIDTH, THUMB_QUALITY } from "@/lib/image-url";

// ── DB Row Types ───────────────────────────────────────────────────────────
// Interfaces representing Supabase PostgREST row shapes from JOIN selects.

interface DbBackstoryRow {
  text?: string;
  author?: string;
  publication?: string;
  publication_url?: string;
  date?: string;
}

interface DbCreativeCommonsRow {
  copyright?: string;
  description?: string;
}

interface DbPhotographerInfoRow {
  bio?: string;
  contact?: string;
  website?: string;
  collaborators?: string;
}

interface DbEthicsRow {
  custom_ethics_text?: string;
  no_manipulation?: boolean;
  manipulation_details?: string;
  no_staging?: boolean;
  staging_details?: string;
  informed_consent?: boolean;
  consent_details?: string;
  identity_protected?: boolean;
  identity_protection_details?: string;
  consent_document_url?: string;
  ai_altered?: boolean;
  ai_altered_details?: string;
}

interface DbLocationRow {
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  country?: string;
  formatted_location?: string;
  captured_at?: string;
  source?: "exif" | "device" | "manual" | "voicevault";
  street?: string;
  street2?: string;
  address_city?: string;
  district?: string;
  state_province?: string;
  postal_code?: string;
  address_country?: string;
}

interface DbPhotoMetadataRow {
  date_taken?: string;
  camera_make?: string;
  camera_model?: string;
  lens_model?: string;
  focal_length?: string;
  iso?: string;
  aperture?: string;
  shutter_speed?: string;
  width?: number;
  height?: number;
  orientation?: number;
  software?: string;
  host_computer?: string;
  artist?: string;
  exif_copyright?: string;
  user_comment?: string;
  image_description?: string;
  temporal_data?: Record<string, unknown>;
  gps_extended?: Record<string, unknown>;
}

interface DbContextItemRow {
  id: string;
  source_type?: string;
  filename?: string;
  mime_type?: string;
  caption?: string;
  media_type?: string;
  url?: string;
  storage_url?: string;
  storage_path?: string;
  thumbnail_storage_path?: string;
  thumbnail_storage_url?: string;
  description?: string;
  credit?: string;
  date?: string;
  position?: number;
  audio_storage_path?: string;
  audio_storage_url?: string;
  audio_mime_type?: string;
  audio_duration?: number;
  linked_project_id?: string;
  linked_project_slug?: string;
}

interface DbLinkRow {
  title?: string;
  url?: string;
  source?: string;
  position?: number;
}

interface DbVoiceTranscriptionRow {
  id: string;
  recording_id: string;
  text?: string;
  transcribed_at?: string;
  field_id?: string;
  audio_storage_path?: string;
  audio_storage_url?: string;
  mime_type?: string;
  duration?: number;
  position?: number;
}

/** Shape of a full NORMALIZED_SELECT PostgREST response row. */
export interface NormalizedRow {
  id: string;
  user_id: string;
  slug?: string | null;
  title?: string | null;
  author?: string | null;
  date?: string | null;
  main_image_storage_path?: string | null;
  main_image_thumbnail_path?: string | null;
  published: boolean;
  in_gallery: boolean;
  parent_project_id?: string | null;
  version_number?: number | null;
  forked_from_user_id?: string | null;
  is_fork?: boolean | null;
  mode?: string | null;
  editor_version?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown> | null;
  project_backstory?: DbBackstoryRow | null;
  project_creative_commons?: DbCreativeCommonsRow | null;
  project_photographer_info?: DbPhotographerInfoRow | null;
  project_ethics?: DbEthicsRow | null;
  project_locations?: DbLocationRow | null;
  photo_metadata?: DbPhotoMetadataRow | null;
  context_items?: DbContextItemRow[] | null;
  links?: DbLinkRow[] | null;
  voice_transcriptions?: DbVoiceTranscriptionRow[] | null;
}

/** Shape of a LISTING_SELECT PostgREST response row. */
export interface ListingRow {
  id: string;
  user_id: string;
  slug?: string | null;
  title?: string | null;
  author?: string | null;
  date?: string | null;
  main_image_storage_path?: string | null;
  main_image_thumbnail_path?: string | null;
  published: boolean;
  in_gallery: boolean;
  parent_project_id?: string | null;
  created_at: string;
  updated_at: string;
  project_backstory?: DbBackstoryRow | null;
  project_creative_commons?: DbCreativeCommonsRow | null;
  project_ethics?: DbEthicsRow | null;
  project_locations?: DbLocationRow | null;
  photo_metadata?: Pick<DbPhotoMetadataRow, "camera_make" | "camera_model"> | null;
  context_items?: DbContextItemRow[] | null;
  links?: DbLinkRow[] | null;
}

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

// ── PostgREST select strings ────────────────────────────────────────────────

/**
 * Full select with LEFT JOINs on ALL normalized tables.
 */
export const NORMALIZED_SELECT = [
  "id",
  "user_id",
  "slug",
  "title",
  "author",
  "date",
  "main_image_storage_path",
  "main_image_thumbnail_path",
  "published",
  "in_gallery",
  "parent_project_id",
  "version_number",
  "forked_from_user_id",
  "is_fork",
  "mode",
  "editor_version",
  "created_at",
  "updated_at",
  "project_backstory(*)",
  "project_creative_commons(*)",
  "project_photographer_info(*)",
  "project_ethics(*)",
  "project_locations(latitude,longitude,city,state,country,formatted_location,captured_at,source,street,street2,address_city,district,state_province,postal_code,address_country)",
  "photo_metadata(*)",
  "context_items!context_items_project_id_fkey(*)",
  "links(*)",
  "voice_transcriptions(*)",
  "metadata",
].join(",");

/**
 * Gallery card select — minimal fields for thumbnail cards.
 * Only pulls what gallery/dashboard cards actually display:
 * title, image, author, description, camera info, context count, link count.
 */
export const GALLERY_SELECT = [
  "id",
  "slug",
  "title",
  "author",
  "date",
  "main_image_url",
  "published",
  "in_gallery",
  "created_at",
  "updated_at",
  "user_id",
  "parent_project_id",
  "project_backstory(text,author,publication,date)",
  "project_creative_commons(copyright,description)",
  "project_locations(city,state,country,formatted_location)",
  "photo_metadata(camera_make,camera_model)",
  "context_items!context_items_project_id_fkey(id,caption)",
  "links(id,title,source)",
].join(",");

/** Shape of a GALLERY_SELECT PostgREST response row. */
export interface GalleryRow {
  id: string;
  user_id: string;
  slug?: string | null;
  title?: string | null;
  author?: string | null;
  date?: string | null;
  main_image_url?: string | null;
  published: boolean;
  in_gallery: boolean;
  created_at: string;
  updated_at: string;
  parent_project_id?: string | null;
  project_backstory?: Pick<DbBackstoryRow, "text" | "author" | "publication" | "date"> | null;
  project_creative_commons?: Pick<DbCreativeCommonsRow, "copyright" | "description"> | null;
  project_locations?: Pick<DbLocationRow, "city" | "state" | "country" | "formatted_location"> | null;
  photo_metadata?: Pick<DbPhotoMetadataRow, "camera_make" | "camera_model"> | null;
  context_items?: { id: string; caption?: string }[] | null;
  links?: { id: string; title?: string; source?: string }[] | null;
}

/**
 * Build a ProjectRecord from lightweight GALLERY_SELECT JOIN results.
 * Used by gallery page for card display — minimal metadata.
 */
export function buildGalleryMetadata(row: GalleryRow): ProjectRecord {
  const {
    project_backstory,
    project_creative_commons,
    project_locations,
    photo_metadata,
    context_items,
    links: linkItems,
    ...rest
  } = row;

  const metadata: Partial<FourCornersMetadataExtended> & Pick<FourCornersMetadataExtended, "backStory" | "creativeCommons"> = {
    backStory: {
      text: project_backstory?.text ?? "",
      author: project_backstory?.author ?? "",
      publication: project_backstory?.publication ?? "",
      publicationUrl: "",
      date: project_backstory?.date ?? "",
    },
    creativeCommons: {
      copyright: project_creative_commons?.copyright ?? "",
      description: project_creative_commons?.description ?? "",
    },
  };

  if (project_locations) {
    metadata.location = {
      latitude: 0,
      longitude: 0,
      city: project_locations.city ?? "",
      state: project_locations.state ?? "",
      country: project_locations.country ?? "",
      formattedLocation: project_locations.formatted_location ?? "",
    };
  }

  if (photo_metadata) {
    metadata.photoMetadata = {
      equipment: {
        cameraMake: photo_metadata.camera_make ?? "",
        cameraModel: photo_metadata.camera_model ?? "",
      },
    };
  }

  // IDs + searchable text for corner indicators and search index
  if (context_items && context_items.length > 0) {
    metadata.context = context_items.map((ci) => ({
      id: ci.id, caption: ci.caption ?? "", type: "image" as const, sourceType: "upload" as const,
    }));
  }
  if (linkItems && linkItems.length > 0) {
    metadata.links = linkItems.map((l) => ({
      title: l.title ?? "", url: "", source: l.source ?? "",
    }));
  }

  return { ...rest, metadata } as ProjectRecord;
}

// ── Gallery Feed View ─────────────────────────────────────────────────────
// Flat row from the `gallery_feed` Postgres view (single query plan,
// replaces PostgREST's 6 separate JOINs).

export interface GalleryFeedRow {
  id: string;
  slug: string | null;
  title: string | null;
  author: string | null;
  date: string | null;
  main_image_url: string | null;
  main_image_storage_path: string | null;
  main_image_thumbnail_path: string | null;
  published: boolean;
  in_gallery: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  parent_project_id: string | null;
  backstory_text: string | null;
  backstory_author: string | null;
  backstory_publication: string | null;
  backstory_date: string | null;
  cc_copyright: string | null;
  cc_description: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  location_formatted: string | null;
  camera_make: string | null;
  camera_model: string | null;
  tags: string[] | null;
  context_items: { id: string; caption?: string }[];
  links: { id: string; title?: string; source?: string }[];
}

/** Select string for the gallery_feed view — all flat columns. */
export const GALLERY_FEED_SELECT = [
  "id",
  "slug",
  "title",
  "author",
  "date",
  "main_image_url",
  "main_image_storage_path",
  "main_image_thumbnail_path",
  "published",
  "in_gallery",
  "created_at",
  "updated_at",
  "user_id",
  "parent_project_id",
  "tags",
  "backstory_text",
  "backstory_author",
  "backstory_publication",
  "backstory_date",
  "cc_copyright",
  "cc_description",
  "location_city",
  "location_state",
  "location_country",
  "location_formatted",
  "camera_make",
  "camera_model",
  "context_items",
  "links",
].join(",");

/**
 * Build a ProjectRecord from a gallery_feed view row.
 * Same shape as buildGalleryMetadata but reads flat columns instead of nested JOINs.
 */
export function buildGalleryFeedRecord(row: GalleryFeedRow): ProjectRecord {
  const metadata: Partial<FourCornersMetadataExtended> & Pick<FourCornersMetadataExtended, "backStory" | "creativeCommons"> = {
    backStory: {
      text: row.backstory_text ?? "",
      author: row.backstory_author ?? "",
      publication: row.backstory_publication ?? "",
      publicationUrl: "",
      date: row.backstory_date ?? "",
    },
    creativeCommons: {
      copyright: row.cc_copyright ?? "",
      description: row.cc_description ?? "",
    },
  };

  if (row.location_city || row.location_state || row.location_country || row.location_formatted) {
    metadata.location = {
      latitude: 0,
      longitude: 0,
      city: row.location_city ?? "",
      state: row.location_state ?? "",
      country: row.location_country ?? "",
      formattedLocation: row.location_formatted ?? "",
    };
  }

  if (row.camera_make || row.camera_model) {
    metadata.photoMetadata = {
      equipment: {
        cameraMake: row.camera_make ?? "",
        cameraModel: row.camera_model ?? "",
      },
    };
  }

  const contextItems = Array.isArray(row.context_items) ? row.context_items : [];
  if (contextItems.length > 0) {
    metadata.context = contextItems.map((ci) => ({
      id: ci.id, caption: ci.caption ?? "", type: "image" as const, sourceType: "upload" as const,
    }));
  }

  const linkItems = Array.isArray(row.links) ? row.links : [];
  if (linkItems.length > 0) {
    metadata.links = linkItems.map((l) => ({
      title: l.title ?? "", url: "", source: l.source ?? "",
    }));
  }

  // Construct public storage URL when storage path exists.
  // The view returns main_image_url=NULL when storage path is set,
  // so we build the URL here where we have access to the env var.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let imageUrl = row.main_image_url;
  if (row.main_image_storage_path && supabaseUrl) {
    imageUrl = `${supabaseUrl}/storage/v1/object/public/context-media/${row.main_image_storage_path}`;
  }
  // Prefer the explicit thumbnail (post migration 041 + backfill); fall back
  // to Supabase Storage's on-the-fly image transform endpoint for any row
  // that has a storage path but no pre-generated thumb yet.
  let thumbnailUrl: string | null = null;
  if (row.main_image_thumbnail_path && supabaseUrl) {
    thumbnailUrl = `${supabaseUrl}/storage/v1/object/public/context-media/${row.main_image_thumbnail_path}`;
  } else if (row.main_image_storage_path && supabaseUrl) {
    thumbnailUrl = renderImageUrl(supabaseUrl, row.main_image_storage_path, {
      width: THUMB_WIDTH,
      quality: THUMB_QUALITY,
    });
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    date: row.date,
    main_image_url: imageUrl,
    main_image_thumbnail_path: row.main_image_thumbnail_path,
    main_image_thumbnail_url: thumbnailUrl,
    published: row.published,
    in_gallery: row.in_gallery,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user_id: row.user_id,
    parent_project_id: row.parent_project_id,
    tags: row.tags ?? [],
    metadata,
  } as ProjectRecord;
}

/**
 * Dashboard listing select — lightweight JOINs for card display.
 */
export const LISTING_SELECT = [
  "id",
  "user_id",
  "slug",
  "title",
  "author",
  "date",
  "main_image_storage_path",
  "main_image_thumbnail_path",
  "published",
  "in_gallery",
  "parent_project_id",
  "created_at",
  "updated_at",
  "project_backstory(text,author,date)",
  "project_creative_commons(copyright,description)",
  "project_ethics(*)",
  "project_locations(latitude,longitude,city,state,country,formatted_location,captured_at,source,street,street2,address_city,district,state_province,postal_code,address_country)",
  "photo_metadata(camera_make,camera_model)",
  "context_items!context_items_project_id_fkey(id,caption,description,credit,filename,date,media_type,source_type,storage_url,thumbnail_storage_url,url,position)",
  "links(title,url,source,position)",
].join(",");

// ── Transform functions ─────────────────────────────────────────────────────

/**
 * Build a ProjectRecord from full NORMALIZED_SELECT JOIN results.
 * Constructs metadata entirely from normalized tables — no JSONB dependency.
 */
export function buildMetadataFromNormalized(row: NormalizedRow): ProjectRecord {
  const {
    project_backstory,
    project_creative_commons,
    project_photographer_info,
    project_ethics: ethics,
    project_locations: location,
    photo_metadata: photoMeta,
    context_items: contextItems,
    links: linkItems,
    voice_transcriptions: voiceItems,
    main_image_storage_path,
    main_image_thumbnail_path,
    ...projectFields
  } = row;

  // Build image URL from storage path (base64 is never selected)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const mainImageUrl = main_image_storage_path && supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/context-media/${main_image_storage_path}`
    : undefined;
  // Prefer pre-generated thumb (migration 041 + backfill); fall back to
  // Supabase's on-the-fly transform endpoint when only the original exists.
  let mainImageThumbnailUrl: string | null = null;
  if (main_image_thumbnail_path && supabaseUrl) {
    mainImageThumbnailUrl = `${supabaseUrl}/storage/v1/object/public/context-media/${main_image_thumbnail_path}`;
  } else if (main_image_storage_path && supabaseUrl) {
    mainImageThumbnailUrl = renderImageUrl(supabaseUrl, main_image_storage_path, {
      width: THUMB_WIDTH,
      quality: THUMB_QUALITY,
    });
  }

  const metadata: Partial<FourCornersMetadataExtended> & Pick<FourCornersMetadataExtended, "backStory" | "creativeCommons" | "context" | "links"> = {
    backStory: {
      text: project_backstory?.text ?? "",
      author: project_backstory?.author ?? "",
      publication: project_backstory?.publication ?? "",
      publicationUrl: project_backstory?.publication_url ?? "",
      date: project_backstory?.date ?? "",
    },
    creativeCommons: {
      copyright: project_creative_commons?.copyright ?? "",
      description: project_creative_commons?.description ?? "",
    },
    context: Array.isArray(contextItems)
      ? contextItems
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((ci) => ({
            id: ci.id,
            sourceType: (ci.source_type || "upload") as "upload" | "url",
            filename: ci.filename ?? undefined,
            mimeType: ci.mime_type ?? undefined,
            caption: ci.caption || "",
            type: (ci.media_type || "image") as "image" | "video",
            url: ci.url ?? undefined,
            src: ci.storage_url ?? undefined,
            storage_path: ci.storage_path ?? undefined,
            storage_url: ci.storage_url ?? undefined,
            thumbnail_storage_path: ci.thumbnail_storage_path ?? undefined,
            thumbnail_storage_url: ci.thumbnail_storage_url ?? undefined,
            thumbnailDataUrl: ci.thumbnail_storage_url || "",
            description: ci.description ?? undefined,
            credit: ci.credit ?? undefined,
            date: ci.date ?? undefined,
            audioStoragePath: ci.audio_storage_path ?? undefined,
            audioStorageUrl: ci.audio_storage_url ?? undefined,
            audioMimeType: ci.audio_mime_type ?? undefined,
            audioDuration: ci.audio_duration ?? undefined,
            linkedProjectId: ci.linked_project_id ?? undefined,
            linkedProjectSlug: ci.linked_project_slug ?? undefined,
          }))
      : [],
    links: Array.isArray(linkItems)
      ? linkItems
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((link) => ({
            title: link.title || "",
            url: link.url || "",
            source: link.source || "",
          }))
      : [],
  };

  if (ethics) {
    metadata.ethics = {
      customEthicsText: ethics.custom_ethics_text ?? "",
      noManipulation: ethics.no_manipulation ?? false,
      manipulationDetails: ethics.manipulation_details ?? "",
      noStaging: ethics.no_staging ?? false,
      stagingDetails: ethics.staging_details ?? "",
      informedConsent: ethics.informed_consent ?? false,
      consentDetails: ethics.consent_details ?? "",
      identityProtected: ethics.identity_protected ?? false,
      identityProtectionDetails: ethics.identity_protection_details ?? "",
      consentDocumentUrl: ethics.consent_document_url ?? "",
      aiAltered: ethics.ai_altered ?? false,
      aiAlteredDetails: ethics.ai_altered_details ?? "",
    };
  }

  if (project_photographer_info) {
    metadata.photographerInfo = {
      bio: project_photographer_info.bio ?? "",
      contact: project_photographer_info.contact ?? "",
      website: project_photographer_info.website ?? "",
      collaborators: project_photographer_info.collaborators ?? "",
    };
  }

  if (location) {
    metadata.location = {
      latitude: location.latitude,
      longitude: location.longitude,
      city: location.city ?? "",
      state: location.state ?? "",
      country: location.country ?? "",
      formattedLocation: location.formatted_location ?? "",
      capturedAt: location.captured_at ?? "",
      source: location.source,
      ...(location.street || location.address_city || location.postal_code
        ? {
            address: {
              street: location.street ?? "",
              street2: location.street2 ?? "",
              city: location.address_city ?? "",
              district: location.district ?? "",
              stateProvince: location.state_province ?? "",
              postalCode: location.postal_code ?? "",
              country: location.address_country ?? "",
            },
          }
        : {}),
    };
  }

  if (photoMeta) {
    metadata.photoMetadata = {
      dateTaken: photoMeta.date_taken ?? "",
      equipment: {
        cameraMake: photoMeta.camera_make ?? "",
        cameraModel: photoMeta.camera_model ?? "",
        lensModel: photoMeta.lens_model ?? "",
        focalLength: photoMeta.focal_length ?? "",
        iso: photoMeta.iso ?? "",
        aperture: photoMeta.aperture ?? "",
        shutterSpeed: photoMeta.shutter_speed ?? "",
      },
      image: {
        width: photoMeta.width ?? 0,
        height: photoMeta.height ?? 0,
        orientation: photoMeta.orientation ?? 0,
      },
      device: {
        software: photoMeta.software ?? "",
        hostComputer: photoMeta.host_computer ?? "",
        artist: photoMeta.artist ?? "",
        copyright: photoMeta.exif_copyright ?? "",
        userComment: photoMeta.user_comment ?? "",
        imageDescription: photoMeta.image_description ?? "",
      },
      ...(photoMeta.temporal_data ? { temporal: photoMeta.temporal_data } : {}),
      ...(photoMeta.gps_extended ? { gps: photoMeta.gps_extended } : {}),
    };
  }

  if (Array.isArray(voiceItems) && voiceItems.length > 0) {
    metadata.voiceTranscriptions = voiceItems
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((vt) => ({
        id: vt.id,
        recordingId: vt.recording_id,
        text: vt.text || "",
        transcribedAt: vt.transcribed_at || "",
        fieldId: vt.field_id ?? undefined,
        audioStoragePath: vt.audio_storage_path ?? undefined,
        audioStorageUrl: vt.audio_storage_url ?? undefined,
        mimeType: vt.mime_type ?? undefined,
        duration: vt.duration ?? undefined,
      }));
  }

  if (projectFields.mode) {
    metadata.meta = {
      mode: projectFields.mode as "minimal" | "standard" | "complete",
      editorVersion: projectFields.editor_version || "1.0.0",
      createdAt: projectFields.created_at,
      updatedAt: projectFields.updated_at,
    };
  }

  return {
    ...projectFields,
    main_image_url: mainImageUrl,
    main_image_storage_path: main_image_storage_path ?? undefined,
    main_image_thumbnail_path: main_image_thumbnail_path ?? null,
    main_image_thumbnail_url: mainImageThumbnailUrl,
    metadata,
  } as ProjectRecord;
}

/**
 * Build a ProjectRecord from lightweight LISTING_SELECT JOIN results.
 * Used by listUserProjects for dashboard display.
 */
export function buildListingMetadata(row: ListingRow): ProjectRecord {
  const {
    project_backstory,
    project_creative_commons,
    project_ethics,
    project_locations,
    photo_metadata,
    context_items,
    links: linkItems,
    main_image_storage_path,
    main_image_thumbnail_path,
    ...rest
  } = row;

  // Build image URL from storage path (base64 is never selected)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const mainImageUrl = main_image_storage_path && supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/context-media/${main_image_storage_path}`
    : undefined;
  // Prefer pre-generated thumb (migration 041 + backfill); fall back to
  // Supabase's on-the-fly transform endpoint when only the original exists.
  let mainImageThumbnailUrl: string | null = null;
  if (main_image_thumbnail_path && supabaseUrl) {
    mainImageThumbnailUrl = `${supabaseUrl}/storage/v1/object/public/context-media/${main_image_thumbnail_path}`;
  } else if (main_image_storage_path && supabaseUrl) {
    mainImageThumbnailUrl = renderImageUrl(supabaseUrl, main_image_storage_path, {
      width: THUMB_WIDTH,
      quality: THUMB_QUALITY,
    });
  }

  const metadata: Partial<FourCornersMetadataExtended> & Pick<FourCornersMetadataExtended, "backStory" | "creativeCommons"> = {
    backStory: {
      text: project_backstory?.text ?? "",
      author: project_backstory?.author ?? "",
      publication: project_backstory?.publication ?? "",
      publicationUrl: project_backstory?.publication_url ?? "",
      date: project_backstory?.date ?? "",
    },
    creativeCommons: {
      copyright: project_creative_commons?.copyright ?? "",
      description: project_creative_commons?.description ?? "",
    },
  };

  if (project_ethics) {
    metadata.ethics = {
      customEthicsText: project_ethics.custom_ethics_text ?? "",
      noManipulation: project_ethics.no_manipulation ?? false,
      manipulationDetails: project_ethics.manipulation_details ?? "",
      noStaging: project_ethics.no_staging ?? false,
      stagingDetails: project_ethics.staging_details ?? "",
      informedConsent: project_ethics.informed_consent ?? false,
      consentDetails: project_ethics.consent_details ?? "",
      identityProtected: project_ethics.identity_protected ?? false,
      identityProtectionDetails: project_ethics.identity_protection_details ?? "",
      aiAltered: project_ethics.ai_altered ?? false,
      aiAlteredDetails: project_ethics.ai_altered_details ?? "",
    };
  }

  if (project_locations) {
    const loc = project_locations;
    metadata.location = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      city: loc.city ?? "",
      state: loc.state ?? "",
      country: loc.country ?? "",
      formattedLocation: loc.formatted_location ?? "",
      capturedAt: loc.captured_at ?? "",
      source: loc.source,
      ...(loc.street || loc.address_city || loc.postal_code
        ? {
            address: {
              street: loc.street ?? "",
              street2: loc.street2 ?? "",
              city: loc.address_city ?? "",
              district: loc.district ?? "",
              stateProvince: loc.state_province ?? "",
              postalCode: loc.postal_code ?? "",
              country: loc.address_country ?? "",
            },
          }
        : {}),
    };
  }

  if (photo_metadata) {
    metadata.photoMetadata = {
      equipment: {
        cameraMake: photo_metadata.camera_make ?? "",
        cameraModel: photo_metadata.camera_model ?? "",
      },
    };
  }

  if (context_items && Array.isArray(context_items)) {
    metadata.context = context_items
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((ci) => ({
        id: ci.id,
        caption: ci.caption ?? "",
        description: ci.description ?? undefined,
        credit: ci.credit ?? undefined,
        filename: ci.filename ?? undefined,
        date: ci.date ?? undefined,
        type: (ci.media_type || "image") as "image" | "video",
        sourceType: (ci.source_type || "upload") as "upload" | "url",
        storage_url: ci.storage_url ?? undefined,
        thumbnail_storage_url: ci.thumbnail_storage_url ?? undefined,
        url: ci.url ?? undefined,
      }));
  }

  if (linkItems && Array.isArray(linkItems)) {
    metadata.links = linkItems
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((link) => ({
        title: link.title || "",
        url: link.url || "",
        source: link.source || "",
      }));
  }

  return {
    ...rest,
    main_image_url: mainImageUrl,
    main_image_storage_path: main_image_storage_path ?? undefined,
    main_image_thumbnail_path: main_image_thumbnail_path ?? null,
    main_image_thumbnail_url: mainImageThumbnailUrl,
    metadata,
  } as ProjectRecord;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Clean empty optional fields from metadata.
 * Removes empty objects and undefined values to prevent validation errors.
 * Preserves empty strings — they are valid defaults for required schema fields.
 */
export function cleanEmptyFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj))
    return obj.map(cleanEmptyFields).filter((v) => v !== undefined);

  const cleaned: Record<string, unknown> = {};
  for (const key in obj as Record<string, unknown>) {
    const value = (obj as Record<string, unknown>)[key];
    if (value === undefined) continue;

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const cleanedNested = cleanEmptyFields(value) as Record<string, unknown>;
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      }
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Validate and sanitize metadata against field-registry schema.
 * Protects against XSS attacks by sanitizing user input.
 */
export function validateMetadata(metadata: Record<string, unknown>): FourCornersMetadataExtended {
  const cleanedMetadata = cleanEmptyFields(metadata);
  const result = FourCornersMetadataExtendedSchema.safeParse(cleanedMetadata);

  if (!result.success) {
    throw new Error(
      `Metadata validation failed: ${result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ")}`,
    );
  }

  return secureMetadata(result.data);
}
