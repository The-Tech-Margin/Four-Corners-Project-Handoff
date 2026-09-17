/**
 * Normalize the two export sources — live editor store state and persisted
 * ProjectRecord — into one ExportProjectInput. Runs on the main thread; the
 * output is structured-cloneable and crosses the worker boundary.
 *
 * No Zustand/DOM imports here: callers pass plain state snapshots.
 */

import type { FourCornersMetadataExtended } from "../field-registry";
import type { ProjectRecord } from "../projects/types";
import type {
  ExportConsentDocument,
  ExportFormat,
  ExportOptions,
  ExportProjectInput,
} from "./types";

/** The slice of editor store state the export engine needs. */
export interface EditorExportState {
  backStory: FourCornersMetadataExtended["backStory"];
  context: FourCornersMetadataExtended["context"];
  links: FourCornersMetadataExtended["links"];
  creativeCommons: FourCornersMetadataExtended["creativeCommons"];
  ethics?: FourCornersMetadataExtended["ethics"];
  photographerInfo?: FourCornersMetadataExtended["photographerInfo"];
  location?: FourCornersMetadataExtended["location"];
  photoMetadata?: FourCornersMetadataExtended["photoMetadata"];
  voiceTranscriptions?: FourCornersMetadataExtended["voiceTranscriptions"];
  meta?: FourCornersMetadataExtended["meta"];
  imageSrc: string | null;
  mainImageStoragePath: string | null;
  consentDocuments: ExportConsentDocument[];
  excludeLocationFromExport: boolean;
  includeExifInExport: boolean;
  projectId: string | null;
  projectTitle: string | null;
  projectSlug: string | null;
}

export function normalizeFromStoreState(
  state: EditorExportState,
): ExportProjectInput {
  return {
    metadata: {
      backStory: state.backStory,
      context: state.context,
      links: state.links,
      creativeCommons: state.creativeCommons,
      ethics: state.ethics,
      photographerInfo: state.photographerInfo,
      location: state.location,
      photoMetadata: state.photoMetadata,
      voiceTranscriptions: state.voiceTranscriptions,
      meta: state.meta,
    },
    projectId: state.projectId ?? undefined,
    title:
      state.projectTitle ||
      state.projectSlug ||
      state.creativeCommons?.description ||
      "four-corners",
    mainImage: {
      src: state.imageSrc ?? undefined,
      storagePath: state.mainImageStoragePath ?? undefined,
    },
    consentDocuments: state.consentDocuments ?? [],
  };
}

/**
 * Dashboard source: a full ProjectRecord from getProject(id) — normalized-table
 * reconstruction, NOT a partial listing row. Consent documents are
 * device-local editor state and never persisted, so they're absent here.
 */
export function normalizeFromProjectRecord(
  project: ProjectRecord,
): ExportProjectInput {
  return {
    metadata: project.metadata,
    projectId: project.id,
    title:
      project.title ||
      project.slug ||
      project.metadata?.creativeCommons?.description ||
      "four-corners",
    mainImage: {
      src: project.main_image_url ?? undefined,
      storagePath: project.main_image_storage_path ?? undefined,
      thumbnailUrl: project.main_image_thumbnail_url ?? undefined,
      thumbnailPath: project.main_image_thumbnail_path ?? undefined,
    },
    consentDocuments: [],
  };
}

/** Editor toggles → engine options (dashboard builds its own from local UI). */
export function optionsFromEditorState(
  state: Pick<
    EditorExportState,
    "excludeLocationFromExport" | "includeExifInExport"
  >,
  format: ExportFormat,
  embedImages: boolean,
): ExportOptions {
  return {
    format,
    embedImages,
    excludeLocation: state.excludeLocationFromExport,
    includeExif: state.includeExifInExport,
    includeConsentDocs: true,
    includeStandaloneInZip: true,
  };
}
