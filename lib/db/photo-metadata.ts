/**
 * Database operations for photo_metadata (normalized table)
 */

import type { PhotoMetadata } from "@/lib/schema";
import { createProjectTableCrud } from "./crud-factory";

export interface PhotoMetadataRecord {
  id: string;
  project_id: string;
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
  created_at?: string;
  updated_at?: string;
}

const toStr = (v: string | number | null | undefined): string | undefined =>
  v != null ? String(v) : undefined;

const toInt = (v: string | number | null | undefined): number | undefined => {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return isNaN(n) ? undefined : n;
};

const crud = createProjectTableCrud<PhotoMetadata, PhotoMetadataRecord>(
  "photo_metadata",
  (projectId, pm) => ({
    project_id: projectId,
    date_taken: pm.dateTaken,
    camera_make: pm.equipment?.cameraMake,
    camera_model: pm.equipment?.cameraModel,
    lens_model: pm.equipment?.lensModel,
    focal_length: pm.equipment?.focalLength,
    iso: toStr(pm.equipment?.iso),
    aperture: pm.equipment?.aperture,
    shutter_speed: pm.equipment?.shutterSpeed,
    width: toInt(pm.image?.width),
    height: toInt(pm.image?.height),
    orientation: toInt(pm.image?.orientation),
    software: pm.device?.software,
    host_computer: pm.device?.hostComputer,
    artist: pm.device?.artist,
    exif_copyright: pm.device?.copyright,
    user_comment: pm.device?.userComment,
    image_description: pm.device?.imageDescription,
    temporal_data: pm.temporal ?? undefined,
    gps_extended: pm.gps ?? undefined,
  }),
);

export const upsertPhotoMetadata = crud.upsert;
export const getPhotoMetadata = crud.get;
export const deletePhotoMetadata = crud.delete;
