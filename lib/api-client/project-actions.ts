/**
 * The project operations components reach for — publish, share, rename,
 * delete — over the app's API. Same names and shapes the editor already
 * used, so call sites read the same as before.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

"use client";

import type { ProjectRecord } from "@/lib/projects/types";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import * as projectsApi from "./projects";

export { GALLERY_LIMIT_REACHED } from "@/lib/projects/rules";

export async function getProject(id: string): Promise<ProjectRecord | null> {
  try {
    return (await projectsApi.get(id)).project;
  } catch {
    return null;
  }
}

export async function getProjectBySlug(slug: string): Promise<ProjectRecord | null> {
  return getProject(slug);
}

/** The caller's own project with this slug, if they have one. */
export async function findOwnProjectBySlug(slug: string): Promise<ProjectRecord | null> {
  try {
    const { project, viewer } = await projectsApi.get(slug);
    return viewer.isOwner ? project : null;
  } catch {
    return null;
  }
}

export async function listUserProjects(limit = 50, offset = 0): Promise<ProjectRecord[]> {
  const { projects } = await projectsApi.listMine(limit, offset);
  return projects;
}

/** Publish or unpublish — this controls the share link, not the gallery. */
export async function togglePublish(
  projectId: string,
  published: boolean,
): Promise<ProjectRecord> {
  const { project } = await projectsApi.setVisibility(projectId, { published });
  return project;
}

/** Add to or remove from the public gallery (publishes as a side effect). */
export async function toggleGallery(
  projectId: string,
  inGallery: boolean,
): Promise<ProjectRecord> {
  const { project } = await projectsApi.setVisibility(projectId, { inGallery });
  return project;
}

export async function updateProjectSlug(
  projectId: string,
  slug: string,
  title?: string,
): Promise<ProjectRecord> {
  const { project } = await projectsApi.patch(projectId, {
    slug,
    ...(title === undefined ? {} : { title }),
  });
  return project;
}

export async function setProjectTags(
  projectId: string,
  tags: string[],
): Promise<ProjectRecord> {
  const { project } = await projectsApi.patch(projectId, { tags });
  return project;
}

export async function deleteProject(projectId: string): Promise<void> {
  await projectsApi.remove(projectId);
}

/** Promote a context image into its own project, chained to this one. */
export async function createChildProject(
  parentProjectId: string,
  input: {
    metadata: FourCornersMetadataExtended;
    slug?: string | null;
    title?: string | null;
  },
): Promise<{ project: ProjectRecord; warnings: string[] }> {
  return projectsApi.createChild(parentProjectId, input);
}
