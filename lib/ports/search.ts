/**
 * Gallery search. The local adapter ranks by keyword; an adapter with
 * embeddings sets `capabilities.semantic` and can rank by meaning.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { ProjectDocument, ProjectId } from "@/lib/projects/types";

export interface SearchQuery {
  query: string;
  limit: number;
  offset: number;
}

export interface SearchPort {
  readonly capabilities: { semantic: boolean };
  searchGallery(query: SearchQuery): Promise<ProjectDocument[]>;
  /** Called after every save; a no-op when the adapter reads documents directly. */
  indexProject(doc: ProjectDocument): Promise<void>;
  removeProject(id: ProjectId): Promise<void>;
}
