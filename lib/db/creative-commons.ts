/**
 * Database operations for project_creative_commons (normalized table)
 */

import type { FourCornersCreativeCommons as CreativeCommons } from "@/lib/schema";
import { createProjectTableCrud } from "./crud-factory";

export interface CreativeCommonsRecord {
  id: string;
  project_id: string;
  copyright?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

const crud = createProjectTableCrud<CreativeCommons, CreativeCommonsRecord>(
  "project_creative_commons",
  (projectId, cc) => ({
    project_id: projectId,
    copyright: cc.copyright,
    description: cc.description,
  }),
);

export const upsertCreativeCommons = crud.upsert;
export const getCreativeCommons = crud.get;
export const deleteCreativeCommons = crud.delete;
