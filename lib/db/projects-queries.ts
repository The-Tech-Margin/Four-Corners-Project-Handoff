/**
 * Project read queries
 * All functions are read-only — no mutations.
 */

import { createClient } from "@/lib/supabase/client";
import {
  type ProjectRecord,
  type NormalizedRow,
  type ListingRow,
  type GalleryRow,
  type GalleryFeedRow,
  NORMALIZED_SELECT,
  LISTING_SELECT,
  GALLERY_SELECT,
  buildMetadataFromNormalized,
  buildListingMetadata,
  buildGalleryMetadata,
  buildGalleryFeedRecord,
} from "./projects-transforms";

// Migration 041 adds `main_image_thumbnail_path`. Until deployed everywhere,
// strip the column from the SELECT and retry on "undefined column" errors.
function selectWithoutThumb(select: string): string {
  return select
    .replace(",main_image_thumbnail_path", "")
    .replace("main_image_thumbnail_path,", "")
    .replace("main_image_thumbnail_path", "");
}

function isMissingThumbColumn(
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (blob.includes("main_image_thumbnail_path")) return true;
  return error.code === "42703" || error.code === "PGRST204";
}

// ── Single-project lookups ──────────────────────────────────────────────────

/** Get project by ID */
export async function getProject(projectId: string) {
  const supabase = createClient();

  let { data, error } = await supabase
    .from("projects")
    .select(NORMALIZED_SELECT)
    .eq("id", projectId)
    .single();

  if (isMissingThumbColumn(error)) {
    ({ data, error } = await supabase
      .from("projects")
      .select(selectWithoutThumb(NORMALIZED_SELECT))
      .eq("id", projectId)
      .single());
  }

  if (error) throw error;
  return buildMetadataFromNormalized(data);
}

/** Get project by slug */
export async function getProjectBySlug(slug: string) {
  const supabase = createClient();

  let { data, error } = await supabase
    .from("projects")
    .select(NORMALIZED_SELECT)
    .eq("slug", slug)
    .single();

  if (isMissingThumbColumn(error)) {
    ({ data, error } = await supabase
      .from("projects")
      .select(selectWithoutThumb(NORMALIZED_SELECT))
      .eq("slug", slug)
      .single());
  }

  if (error) throw error;
  return buildMetadataFromNormalized(data);
}

/** Check if user has a file with the given slug */
export async function userHasFileWithSlug(
  userId: string,
  slug: string,
): Promise<ProjectRecord | null> {
  const supabase = createClient();

  try {
    let { data, error } = await supabase
      .from("projects")
      .select(NORMALIZED_SELECT)
      .eq("slug", slug)
      .eq("user_id", userId)
      .single();

    if (isMissingThumbColumn(error)) {
      ({ data, error } = await supabase
        .from("projects")
        .select(selectWithoutThumb(NORMALIZED_SELECT))
        .eq("slug", slug)
        .eq("user_id", userId)
        .single());
    }

    if (error || !data) return null;
    return buildMetadataFromNormalized(data);
  } catch {
    return null;
  }
}

/**
 * Get project by slug or ID.
 * If userId is provided and a slug is used, prioritizes user's own file.
 * Detects UUIDs and queries by ID directly.
 */
export async function getProjectBySlugOrId(slugOrId: string, userId?: string) {
  const supabase = createClient();
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(slugOrId)) {
    try {
      return await getProject(slugOrId);
    } catch {
      throw new Error(`File not found: ${slugOrId}`);
    }
  }

  if (userId) {
    try {
      let { data, error } = await supabase
        .from("projects")
        .select(NORMALIZED_SELECT)
        .eq("slug", slugOrId)
        .eq("user_id", userId)
        .single();

      if (isMissingThumbColumn(error)) {
        ({ data, error } = await supabase
          .from("projects")
          .select(selectWithoutThumb(NORMALIZED_SELECT))
          .eq("slug", slugOrId)
          .eq("user_id", userId)
          .single());
      }

      if (!error && data) {
        return buildMetadataFromNormalized(data);
      }
    } catch {
      // User doesn't have a file with this slug, continue to shared lookup
    }
  }

  try {
    return await getProjectBySlug(slugOrId);
  } catch {
    throw new Error(`File not found: ${slugOrId}`);
  }
}

// ── List queries ────────────────────────────────────────────────────────────

/**
 * List user's projects for dashboard display.
 * Accepts an optional supabase client for server-side usage.
 */
export async function listUserProjects(
  userId: string,
  supabaseClient?: ReturnType<typeof createClient>,
  limit = 24,
  offset = 0,
) {
  const supabase = supabaseClient || createClient();

  let { data, error } = await supabase
    .from("projects")
    .select(LISTING_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (isMissingThumbColumn(error)) {
    ({ data, error } = await supabase
      .from("projects")
      .select(selectWithoutThumb(LISTING_SELECT))
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1));
  }

  if (error) throw error;
  return (data || []).map((row: ListingRow) => buildListingMetadata(row));
}

/**
 * Search projects using full-text search (tsvector) when available,
 * falling back to ilike on title/author.
 *
 * For published gallery search, uses the `search_gallery_projects` RPC
 * which searches across ALL normalized tables with ranked results.
 * For user-scoped searches (dashboard), uses ilike as before.
 */
export async function searchProjects(
  query: string,
  userId?: string,
  publishedOnly = false,
) {
  const supabase = createClient();

  // For published/gallery search, use the tsvector-based RPC
  if (publishedOnly && !userId) {
    const { data, error } = await supabase.rpc("search_gallery_projects", {
      search_query: query,
      result_limit: 100,
      result_offset: 0,
    });

    if (!error && data) {
      return (data as GalleryFeedRow[]).map(buildGalleryFeedRecord);
    }
    // Fall through to ilike if RPC fails (e.g. migration not applied)
  }

  // User-scoped or fallback: ilike on title/author
  const buildQuery = (select: string) => {
    let qb = supabase.from("projects").select(select);
    if (publishedOnly) {
      qb = qb.eq("published", true);
    } else if (userId) {
      qb = qb.eq("user_id", userId);
    }
    return qb
      .or(`title.ilike.%${query}%,author.ilike.%${query}%`)
      .order("created_at", { ascending: false });
  };

  let { data, error } = await buildQuery(NORMALIZED_SELECT);
  if (isMissingThumbColumn(error)) {
    ({ data, error } = await buildQuery(selectWithoutThumb(NORMALIZED_SELECT)));
  }

  if (error) throw error;
  return (data as NormalizedRow[]).map(buildMetadataFromNormalized);
}

// ── Gallery queries ─────────────────────────────────────────────────────────

/** Get all children of a project (daisy-chained images) */
export async function getProjectChildren(projectId: string) {
  const supabase = createClient();

  let { data, error } = await supabase
    .from("projects")
    .select(NORMALIZED_SELECT)
    .eq("parent_project_id", projectId)
    .eq("in_gallery", true)
    .order("created_at", { ascending: true });

  if (isMissingThumbColumn(error)) {
    ({ data, error } = await supabase
      .from("projects")
      .select(selectWithoutThumb(NORMALIZED_SELECT))
      .eq("parent_project_id", projectId)
      .eq("in_gallery", true)
      .order("created_at", { ascending: true }));
  }

  if (error) throw error;
  return (data as NormalizedRow[]).map(buildMetadataFromNormalized);
}

/**
 * Get gallery projects grouped by parent-child relationships.
 * Returns root projects with their children.
 */
export async function getGalleryImageSets(limit = 24, offset = 0) {
  const supabase = createClient();

  if (!supabase) {
    throw new Error("Unable to connect to database — configuration missing");
  }

  let data: GalleryRow[] | null = null;
  let error: { message: string } | null = null;

  try {
    const result = await supabase
      .from("projects")
      .select(GALLERY_SELECT)
      .eq("published", true)
      .eq("in_gallery", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    data = result.data as GalleryRow[] | null;
    error = result.error;
  } catch (fetchErr: unknown) {
    const message = fetchErr instanceof Error ? fetchErr.message : "Failed to fetch";
    throw new Error(
      `Network error loading gallery: ${message}. Please check your connection and try again.`,
    );
  }

  if (error) throw new Error(error.message || "Failed to load gallery");

  const projects = (data || []).map(buildGalleryMetadata) as ProjectRecord[];

  // Group by parent — O(n) using a Map
  const childrenMap = new Map<string, ProjectRecord[]>();
  const roots: ProjectRecord[] = [];

  for (const project of projects) {
    if (project.parent_project_id) {
      const siblings = childrenMap.get(project.parent_project_id) || [];
      siblings.push(project);
      childrenMap.set(project.parent_project_id, siblings);
    } else {
      roots.push(project);
    }
  }

  const sets: { root: ProjectRecord; children: ProjectRecord[] }[] = [];
  const processedIds = new Set<string>();

  for (const root of roots) {
    sets.push({
      root,
      children: childrenMap.get(root.id) || [],
    });
    processedIds.add(root.id);
    (childrenMap.get(root.id) || []).forEach((c) => processedIds.add(c.id));
  }

  // Add orphaned children (parent not in gallery) as individual sets
  for (const project of projects) {
    if (!processedIds.has(project.id)) {
      sets.push({ root: project, children: [] });
    }
  }

  return sets;
}

/**
 * Get adjacent gallery items (prev/next) for swipe navigation.
 */
export async function getAdjacentGalleryItems(
  currentProjectId: string,
): Promise<{
  prev: { id: string; slug: string | null; main_image_url: string | null } | null;
  next: { id: string; slug: string | null; main_image_url: string | null } | null;
}> {
  const supabase = createClient();

  if (!supabase) return { prev: null, next: null };

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("id, slug, main_image_storage_path, created_at")
      .eq("published", true)
      .eq("in_gallery", true)
      .is("parent_project_id", null)
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) return { prev: null, next: null };

    const currentIndex = data.findIndex((p: { id: string }) => p.id === currentProjectId);
    if (currentIndex === -1) return { prev: null, next: null };

    const prev = currentIndex > 0 ? data[currentIndex - 1] : null;
    const next = currentIndex < data.length - 1 ? data[currentIndex + 1] : null;

    const storageUrl = (path: string | null) =>
      path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/context-media/${path}` : null;

    return {
      prev: prev ? { id: prev.id, slug: prev.slug, main_image_url: storageUrl(prev.main_image_storage_path) } : null,
      next: next ? { id: next.id, slug: next.slug, main_image_url: storageUrl(next.main_image_storage_path) } : null,
    };
  } catch {
    return { prev: null, next: null };
  }
}

// ── Geo queries ─────────────────────────────────────────────────────────────

/**
 * Get projects by location (within radius).
 * Still uses JS Haversine — PostGIS ST_DWithin planned for Phase 5.
 */
export async function getProjectsByLocation(
  latitude: number,
  longitude: number,
  radiusKm: number = 50,
) {
  const supabase = createClient();

  let { data, error } = await supabase
    .from("projects")
    .select(`${NORMALIZED_SELECT}`)
    .eq("published", true)
    .not("project_locations", "is", null);

  if (isMissingThumbColumn(error)) {
    ({ data, error } = await supabase
      .from("projects")
      .select(selectWithoutThumb(NORMALIZED_SELECT))
      .eq("published", true)
      .not("project_locations", "is", null));
  }

  if (error) throw error;

  const projects = (data as NormalizedRow[]).map(buildMetadataFromNormalized);
  return projects.filter((project) => {
    const loc = project.metadata?.location;
    if (!loc?.latitude || !loc?.longitude) return false;
    return calculateDistance(latitude, longitude, loc.latitude, loc.longitude) <= radiusKm;
  });
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
