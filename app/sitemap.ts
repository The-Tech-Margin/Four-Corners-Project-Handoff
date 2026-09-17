/**
 * Dynamic sitemap.xml. Static routes + every in_gallery=true project's
 * /view/<slug> URL. Fail-soft: if the Supabase fetch errors, the static
 * routes still ship so crawlers always get something.
 */

import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicKey } from "@/lib/supabase/public-key";

const SITE = "https://four-corners.thetechmargin.com";

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: `${SITE}/`, changeFrequency: "weekly", priority: 1.0 },
  { url: `${SITE}/gallery`, changeFrequency: "daily", priority: 0.9 },
  { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.6 },
  { url: `${SITE}/join`, changeFrequency: "monthly", priority: 0.5 },
];

async function fetchGalleryProjects(): Promise<
  { slug: string; updated_at: string | null }[]
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublicKey();
  if (!url || !key) return [];

  try {
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from("projects")
      .select("slug, updated_at")
      .eq("in_gallery", true)
      .not("slug", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (error) return [];
    return (data ?? []) as { slug: string; updated_at: string | null }[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await fetchGalleryProjects();
  const projectRoutes: MetadataRoute.Sitemap = projects
    .filter((p) => p.slug && p.slug.trim().length > 0)
    .map((p) => ({
      url: `${SITE}/view/${encodeURIComponent(p.slug)}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: "monthly",
      priority: 0.7,
    }));

  return [...STATIC_ROUTES, ...projectRoutes];
}
