/**
 * Database operations for project_backstory (normalized table)
 */

import type { FourCornersBackStory as BackStory } from "@/lib/schema";
import { createProjectTableCrud } from "./crud-factory";

export interface BackstoryRecord {
  id: string;
  project_id: string;
  text?: string;
  author?: string;
  publication?: string;
  publication_url?: string;
  date?: string;
  created_at?: string;
  updated_at?: string;
}

const crud = createProjectTableCrud<BackStory, BackstoryRecord>(
  "project_backstory",
  (projectId, backstory) => ({
    project_id: projectId,
    text: backstory.text,
    author: backstory.author,
    publication: backstory.publication,
    publication_url: backstory.publicationUrl,
    date: backstory.date,
  }),
);

export const upsertBackstory = crud.upsert;
export const getBackstory = crud.get;
export const deleteBackstory = crud.delete;
