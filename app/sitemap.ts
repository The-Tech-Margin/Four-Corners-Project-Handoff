/**
 * Dynamic sitemap.xml: the static routes plus every gallery project's
 * /view/<slug> URL.
 */

import type { MetadataRoute } from "next";
import { getServices } from "@/lib/adapters";
import { siteUrl } from "@/lib/attribution";

const SITE = siteUrl();

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: `${SITE}/`, changeFrequency: "weekly", priority: 1.0 },
  { url: `${SITE}/gallery`, changeFrequency: "daily", priority: 0.9 },
  { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.6 },
];

async function fetchGalleryProjects(): Promise<{ slug: string; updatedAt: string }[]> {
  try {
    return await getServices().projects.listSitemapEntries(5000);
  } catch {
    // Fail soft: the static routes still ship so crawlers get something.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await fetchGalleryProjects();
  const projectRoutes: MetadataRoute.Sitemap = projects
    .filter((entry) => entry.slug.trim().length > 0)
    .map((entry) => ({
      url: `${SITE}/view/${encodeURIComponent(entry.slug)}`,
      lastModified: entry.updatedAt ? new Date(entry.updatedAt) : undefined,
      changeFrequency: "monthly",
      priority: 0.7,
    }));

  return [...STATIC_ROUTES, ...projectRoutes];
}
