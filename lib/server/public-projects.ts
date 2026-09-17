/**
 * The public API's view of a project.
 *
 * One chokepoint for the visibility rule: a project is public only when it
 * is published AND listed in the gallery. Every /api/public/v1 route reads
 * through here, so no per-corner route can leak unpublished work.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { getServices } from "@/lib/adapters";
import { toProjectRecord, withAbsoluteMediaUrls } from "@/lib/projects/projections";
import { siteUrl } from "@/lib/attribution";
import type { ProjectRecord } from "@/lib/projects/types";

export async function getPublicProjectBySlug(slug: string): Promise<ProjectRecord | null> {
  const doc = await getServices().projects.getBySlug(slug);
  if (!doc || !doc.published || !doc.inGallery) return null;
  return withAbsoluteMediaUrls(toProjectRecord(doc), siteUrl());
}

export async function getPublicProjectChildren(projectId: string): Promise<ProjectRecord[]> {
  const children = await getServices().projects.listChildren(projectId, { publicOnly: true });
  return children
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map((child) => withAbsoluteMediaUrls(toProjectRecord(child), siteUrl()));
}
