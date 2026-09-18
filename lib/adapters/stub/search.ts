/**
 * Search stub.
 *
 * A production adapter ranks published gallery projects for a query. It may
 * use the database's own text search, or embeddings — set
 * `capabilities.semantic` so the UI can say which it is.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { NotConfiguredError } from "@/lib/ports/errors";
import type { SearchPort } from "@/lib/ports/search";

const fail = (): never => {
  throw new NotConfiguredError(
    "SearchPort",
    "FC_SEARCH_ADAPTER",
    "Implement lib/ports/search.ts, or use the local keyword ranking.",
  );
};

export function createStubSearch(): SearchPort {
  return {
    capabilities: { semantic: false },
    searchGallery: fail,
    indexProject: fail,
    removeProject: fail,
  };
}
