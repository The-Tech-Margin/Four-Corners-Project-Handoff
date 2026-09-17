/**
 * Database operations for project_photographer_info (normalized table)
 */

import type { PhotographerInfo } from "@/lib/schema";
import { createProjectTableCrud } from "./crud-factory";

export interface PhotographerInfoRecord {
  id: string;
  project_id: string;
  bio?: string;
  contact?: string;
  website?: string;
  collaborators?: string;
  created_at?: string;
  updated_at?: string;
}

const crud = createProjectTableCrud<PhotographerInfo, PhotographerInfoRecord>(
  "project_photographer_info",
  (projectId, info) => ({
    project_id: projectId,
    bio: info.bio,
    contact: info.contact,
    website: info.website,
    collaborators: info.collaborators,
  }),
);

export const upsertPhotographerInfo = crud.upsert;
export const getPhotographerInfo = crud.get;
export const deletePhotographerInfo = crud.delete;
