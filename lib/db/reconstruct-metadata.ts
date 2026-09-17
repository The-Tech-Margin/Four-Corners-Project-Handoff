/**
 * Reconstruct FourCornersMetadataExtended from normalized tables.
 * This is the bridge between normalized DB storage and the metadata shape
 * that export functions and the API response expect.
 *
 * IMPORTANT: Output shape MUST stay in parity with buildMetadataFromNormalized
 * in projects.ts — both functions reconstruct the same metadata shape.
 */

import { createClient } from "@/lib/supabase/client";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { getBackstory, type BackstoryRecord } from "./backstory";
import { getCreativeCommons, type CreativeCommonsRecord } from "./creative-commons";
import { getPhotographerInfo, type PhotographerInfoRecord } from "./photographer-info";
import { getEthics, type EthicsRecord } from "./ethics";
import { getLocation, type LocationRecord } from "./locations";
import { getPhotoMetadata, type PhotoMetadataRecord } from "./photo-metadata";
import { getContextItems } from "./context-items";
import { getLinks } from "./links";
import { getVoiceTranscriptions } from "./voice-transcriptions";

type SupabaseClient = ReturnType<typeof createClient>;

/** Shape of a context_items DB row as returned by getContextItems */
interface ContextItemRow {
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
  audio_storage_path?: string;
  audio_storage_url?: string;
  audio_mime_type?: string;
  audio_duration?: number;
  linked_project_id?: string;
  linked_project_slug?: string;
}

/** Shape of a links DB row */
interface LinkRow {
  title?: string;
  url?: string;
  source?: string;
}

/** Shape of a voice_transcriptions DB row */
interface VoiceTranscriptionRow {
  id: string;
  recording_id?: string;
  text?: string;
  transcribed_at?: string;
  field_id?: string;
  audio_storage_path?: string;
  audio_storage_url?: string;
  mime_type?: string;
  duration?: number;
  position?: number;
}

/**
 * Reconstruct the full metadata object from normalized tables.
 * All queries run in parallel for performance.
 */
export async function reconstructMetadata(
  projectId: string,
  sb?: SupabaseClient,
): Promise<FourCornersMetadataExtended> {
  const [backstory, cc, photographerInfo, ethics, location, photoMeta, contextItems, links, voiceTranscriptions] =
    await Promise.all([
      getBackstory(projectId, sb),
      getCreativeCommons(projectId, sb),
      getPhotographerInfo(projectId, sb),
      getEthics(projectId, sb),
      getLocation(projectId, sb),
      getPhotoMetadata(projectId, sb),
      getContextItems(projectId, sb),
      getLinks(projectId, sb),
      getVoiceTranscriptions(projectId, sb),
    ]);

  const metadata: FourCornersMetadataExtended = {
    backStory: mapBackstory(backstory),
    creativeCommons: mapCreativeCommons(cc),
    context: ((contextItems || []) as ContextItemRow[]).map((item) => ({
      id: item.id,
      sourceType: (item.source_type || "upload") as "upload" | "url",
      filename: item.filename,
      mimeType: item.mime_type,
      caption: item.caption || "",
      type: (item.media_type || "image") as "image" | "video",
      url: item.url,
      src: item.storage_url,
      storage_path: item.storage_path,
      storage_url: item.storage_url,
      thumbnail_storage_path: item.thumbnail_storage_path,
      thumbnail_storage_url: item.thumbnail_storage_url,
      thumbnailDataUrl: item.thumbnail_storage_url || "",
      description: item.description,
      credit: item.credit,
      date: item.date,
      audioStoragePath: item.audio_storage_path,
      audioStorageUrl: item.audio_storage_url,
      audioMimeType: item.audio_mime_type,
      audioDuration: item.audio_duration,
      linkedProjectId: item.linked_project_id,
      linkedProjectSlug: item.linked_project_slug,
    })),
    links: ((links || []) as LinkRow[]).map((link) => ({
      title: link.title || "",
      url: link.url || "",
      source: link.source || "",
    })),
  };

  if (ethics) metadata.ethics = mapEthics(ethics);
  if (photographerInfo) metadata.photographerInfo = mapPhotographerInfo(photographerInfo);
  if (location) metadata.location = mapLocation(location);
  if (photoMeta) metadata.photoMetadata = mapPhotoMetadata(photoMeta);

  if (voiceTranscriptions && voiceTranscriptions.length > 0) {
    metadata.voiceTranscriptions = (voiceTranscriptions as VoiceTranscriptionRow[])
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((vt) => ({
        id: vt.id,
        recordingId: vt.recording_id || "",
        text: vt.text || "",
        transcribedAt: vt.transcribed_at || "",
        fieldId: vt.field_id,
        audioStoragePath: vt.audio_storage_path,
        audioStorageUrl: vt.audio_storage_url,
        mimeType: vt.mime_type,
        duration: vt.duration,
      }));
  }

  return metadata;
}

function mapBackstory(record: BackstoryRecord | null) {
  if (!record) return { text: "", author: "", publication: "", publicationUrl: "", date: "" };
  return {
    text: record.text ?? "",
    author: record.author ?? "",
    publication: record.publication ?? "",
    publicationUrl: record.publication_url ?? "",
    date: record.date ?? "",
  };
}

function mapCreativeCommons(record: CreativeCommonsRecord | null) {
  if (!record) return { copyright: "", description: "" };
  return {
    copyright: record.copyright ?? "",
    description: record.description ?? "",
  };
}

function mapEthics(record: EthicsRecord) {
  return {
    customEthicsText: record.custom_ethics_text ?? "",
    noManipulation: record.no_manipulation,
    manipulationDetails: record.manipulation_details ?? "",
    noStaging: record.no_staging,
    stagingDetails: record.staging_details ?? "",
    informedConsent: record.informed_consent,
    consentDetails: record.consent_details ?? "",
    identityProtected: record.identity_protected,
    identityProtectionDetails: record.identity_protection_details ?? "",
    consentDocumentUrl: record.consent_document_url ?? "",
    aiAltered: record.ai_altered ?? false,
    aiAlteredDetails: record.ai_altered_details ?? "",
  };
}

function mapPhotographerInfo(record: PhotographerInfoRecord) {
  return {
    bio: record.bio ?? "",
    contact: record.contact ?? "",
    website: record.website ?? "",
    collaborators: record.collaborators ?? "",
  };
}

function mapLocation(record: LocationRecord) {
  return {
    latitude: record.latitude,
    longitude: record.longitude,
    city: record.city ?? "",
    state: record.state ?? "",
    country: record.country ?? "",
    formattedLocation: record.formatted_location ?? "",
    capturedAt: record.captured_at ?? "",
    source: (record.source || undefined) as "exif" | "device" | "manual" | "voicevault" | undefined,
    ...(record.street || record.address_city || record.postal_code
      ? {
          address: {
            street: record.street ?? "",
            street2: record.street2 ?? "",
            city: record.address_city ?? "",
            district: record.district ?? "",
            stateProvince: record.state_province ?? "",
            postalCode: record.postal_code ?? "",
            country: record.address_country ?? "",
          },
        }
      : {}),
  };
}

function mapPhotoMetadata(record: PhotoMetadataRecord) {
  return {
    dateTaken: record.date_taken ?? "",
    equipment: {
      cameraMake: record.camera_make ?? "",
      cameraModel: record.camera_model ?? "",
      lensModel: record.lens_model ?? "",
      focalLength: record.focal_length ?? "",
      iso: record.iso ?? "",
      aperture: record.aperture ?? "",
      shutterSpeed: record.shutter_speed ?? "",
    },
    image: {
      width: record.width ?? 0,
      height: record.height ?? 0,
      orientation: record.orientation ?? 0,
    },
    device: {
      software: record.software ?? "",
      hostComputer: record.host_computer ?? "",
      artist: record.artist ?? "",
      copyright: record.exif_copyright ?? "",
      userComment: record.user_comment ?? "",
      imageDescription: record.image_description ?? "",
    },
    ...(record.temporal_data ? { temporal: record.temporal_data } : {}),
    ...(record.gps_extended ? { gps: record.gps_extended } : {}),
  };
}
