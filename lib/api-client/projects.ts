/**
 * Project calls from the browser.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { MainImageRef, ProjectRecord } from "@/lib/projects/types";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { apiGet, apiSend } from "./http";

export interface SaveResponse {
  project: ProjectRecord;
  warnings: string[];
}

export interface ProjectResponse {
  project: ProjectRecord;
  viewer: { isOwner: boolean; isAuthenticated: boolean };
}

export interface ProjectInput {
  metadata: FourCornersMetadataExtended;
  mainImage?: MainImageRef;
  slug?: string | null;
  title?: string | null;
  tags?: string[];
}

export const listMine = (limit = 50, offset = 0): Promise<{ projects: ProjectRecord[] }> =>
  apiGet(`/api/projects?limit=${limit}&offset=${offset}`);

/** By id or slug — the route resolves either. */
export const get = (ref: string): Promise<ProjectResponse> =>
  apiGet(`/api/projects/${encodeURIComponent(ref)}`);

export const create = (input: ProjectInput): Promise<SaveResponse> =>
  apiSend("/api/projects", "POST", input);

export const save = (id: string, input: ProjectInput): Promise<SaveResponse> =>
  apiSend(`/api/projects/${encodeURIComponent(id)}`, "PUT", input);

export const patch = (
  id: string,
  changes: { slug?: string; title?: string | null; tags?: string[] },
): Promise<{ project: ProjectRecord }> =>
  apiSend(`/api/projects/${encodeURIComponent(id)}`, "PATCH", changes);

export const setVisibility = (
  id: string,
  change: { published?: boolean; inGallery?: boolean },
): Promise<{ project: ProjectRecord }> =>
  apiSend(`/api/projects/${encodeURIComponent(id)}/visibility`, "PUT", change);

export const createChild = (
  parentId: string,
  input: ProjectInput,
): Promise<SaveResponse> =>
  apiSend(`/api/projects/${encodeURIComponent(parentId)}/children`, "POST", input);

export const duplicate = (
  id: string,
  input: { slug?: string | null; title?: string | null } = {},
): Promise<{ project: ProjectRecord }> =>
  apiSend(`/api/projects/${encodeURIComponent(id)}/duplicate`, "POST", input);

export const remove = (id: string): Promise<{ ok: true }> =>
  apiSend(`/api/projects/${encodeURIComponent(id)}`, "DELETE");
