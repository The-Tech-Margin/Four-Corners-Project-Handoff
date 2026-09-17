/**
 * Gallery and search calls from the browser.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { ImageSet } from "@/lib/gallery-utils";
import type { ProjectRecord } from "@/lib/projects/types";
import { apiGet } from "./http";

export interface AdjacentItem {
  id: string;
  slug: string | null;
  title: string | null;
  thumbnailUrl: string | null;
}

export const feed = (limit = 24, offset = 0): Promise<ImageSet[]> =>
  apiGet(`/api/gallery?limit=${limit}&offset=${offset}`);

export const search = (
  query: string,
  limit = 24,
): Promise<{ projects: ProjectRecord[]; semantic: boolean }> =>
  apiGet(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);

export const adjacent = (
  id: string,
): Promise<{ prev: AdjacentItem | null; next: AdjacentItem | null }> =>
  apiGet(`/api/gallery/adjacent?id=${encodeURIComponent(id)}`);
