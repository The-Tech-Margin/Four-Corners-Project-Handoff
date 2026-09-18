/**
 * Local search: keyword ranking over the gallery documents themselves, so
 * there is no index to build or keep in sync.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { ProjectRepository } from "@/lib/ports/projects";
import type { SearchPort } from "@/lib/ports/search";
import { rankProjectsByKeywords } from "@/lib/search/keyword-rank";

export function createLocalSearch(projects: ProjectRepository): SearchPort {
  return {
    capabilities: { semantic: false },

    async searchGallery({ query, limit, offset }) {
      const docs = await projects.listGalleryAll();
      return rankProjectsByKeywords(docs, query).slice(offset, offset + limit);
    },

    async indexProject() {
      /* documents are the index */
    },

    async removeProject() {
      /* nothing to remove */
    },
  };
}
