/**
 * Server-side fetch for projects exposed via the public API (/api/public/v1).
 *
 * Single chokepoint for the visibility rule: a project is "public" only when
 * `published = true AND in_gallery = true`. Every public route MUST go through
 * here so unpublished work cannot leak via a per-corner subroute.
 */

import { createClient } from "@/lib/supabase/server";
import {
  type NormalizedRow,
  type ProjectRecord,
  NORMALIZED_SELECT,
  buildMetadataFromNormalized,
} from "@/lib/db/projects-transforms";

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

export async function getPublicProjectBySlug(
  slug: string,
): Promise<ProjectRecord | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const run = (select: string) =>
    supabase
      .from("projects")
      .select(select)
      .eq("slug", slug)
      .eq("published", true)
      .eq("in_gallery", true)
      .maybeSingle();

  let { data, error } = await run(NORMALIZED_SELECT);
  if (isMissingThumbColumn(error)) {
    ({ data, error } = await run(selectWithoutThumb(NORMALIZED_SELECT)));
  }

  if (error || !data) return null;
  return buildMetadataFromNormalized(data as NormalizedRow);
}

export async function getPublicProjectChildren(
  projectId: string,
): Promise<ProjectRecord[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const run = (select: string) =>
    supabase
      .from("projects")
      .select(select)
      .eq("parent_project_id", projectId)
      .eq("published", true)
      .eq("in_gallery", true)
      .order("created_at", { ascending: true });

  let { data, error } = await run(NORMALIZED_SELECT);
  if (isMissingThumbColumn(error)) {
    ({ data, error } = await run(selectWithoutThumb(NORMALIZED_SELECT)));
  }

  if (error || !data) return [];
  return (data as NormalizedRow[]).map(buildMetadataFromNormalized);
}
