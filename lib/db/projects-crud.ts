/**
 * Project write operations (create, update, delete, toggle)
 */

import { createClient } from "@/lib/supabase/client";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { type ProjectRecord, validateMetadata } from "./projects-transforms";
import { normalizeTags } from "@/lib/tags";

// Migration 041 adds `main_image_thumbnail_path`. Until deployed everywhere,
// strip the column on write errors that look like "undefined column".
function isMissingThumbColumn(
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (blob.includes("main_image_thumbnail_path")) return true;
  return error.code === "42703" || error.code === "PGRST204";
}

// ── Create / Update ─────────────────────────────────────────────────────────

/**
 * Create a new project.
 * Writes to projects table; normalized tables synced by the caller.
 */
export async function createProject(
  metadata: FourCornersMetadataExtended,
  userId: string,
  slug?: string,
  mainImageUrl?: string,
  mainImageStoragePath?: string,
  parentProjectId?: string,
  autoAddToGallery: boolean = false,
  tags?: string[],
  title?: string,
  mainImageThumbnailPath?: string | null,
) {
  const supabase = createClient();
  const validatedMetadata = validateMetadata(metadata);

  const record: Record<string, unknown> = {
    user_id: userId,
    slug: slug,
    title: title?.trim() || null,
    metadata: validatedMetadata,
    main_image_url: mainImageUrl,
    main_image_storage_path: mainImageStoragePath,
    published: parentProjectId ? true : false,
    in_gallery: parentProjectId ? true : autoAddToGallery,
    mode: validatedMetadata.meta?.mode || "standard",
    editor_version: validatedMetadata.meta?.editorVersion || "1.0.0",
    tags: tags ? normalizeTags(tags) : [],
  };

  if (mainImageThumbnailPath !== undefined && mainImageThumbnailPath !== null) {
    record.main_image_thumbnail_path = mainImageThumbnailPath;
  }

  if (parentProjectId) {
    record.parent_project_id = parentProjectId;
  }

  let { data, error } = await supabase
    .from("projects")
    .insert(record)
    .select()
    .single();

  if (isMissingThumbColumn(error)) {
    const { main_image_thumbnail_path: _drop, ...stripped } = record;
    void _drop;
    ({ data, error } = await supabase
      .from("projects")
      .insert(stripped)
      .select()
      .single());
  }

  if (error) throw error;
  return data as ProjectRecord;
}

/** Update project title + slug (rename file). Slug should be derived from title. */
export async function updateProjectSlug(
  projectId: string,
  newSlug: string,
  newTitle?: string,
) {
  const supabase = createClient();

  const update: Record<string, unknown> = {
    slug: newSlug,
    updated_at: new Date().toISOString(),
  };
  if (newTitle !== undefined) {
    update.title = newTitle.trim() || null;
  }

  const { data, error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", projectId)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectRecord;
}

/**
 * Update project metadata.
 * Writes JSONB + project-level columns; normalized tables synced by the caller.
 */
export async function updateProject(
  projectId: string,
  metadata: FourCornersMetadataExtended,
  userId: string,
  mainImageUrl?: string,
  mainImageStoragePath?: string,
  mainImageThumbnailPath?: string | null,
) {
  const supabase = createClient();
  const validatedMetadata = validateMetadata(metadata);

  const record: Record<string, unknown> = {
    metadata: validatedMetadata,
    mode: validatedMetadata.meta?.mode || "standard",
    editor_version: validatedMetadata.meta?.editorVersion || "1.0.0",
    updated_at: new Date().toISOString(),
  };

  if (mainImageUrl !== undefined) {
    record.main_image_url = mainImageUrl;
  }
  if (mainImageStoragePath !== undefined) {
    record.main_image_storage_path = mainImageStoragePath;
  }
  if (mainImageThumbnailPath !== undefined) {
    record.main_image_thumbnail_path = mainImageThumbnailPath;
  }

  let { data, error } = await supabase
    .from("projects")
    .update(record)
    .eq("id", projectId)
    .eq("user_id", userId)
    .select()
    .single();

  if (isMissingThumbColumn(error)) {
    const { main_image_thumbnail_path: _drop, ...stripped } = record;
    void _drop;
    ({ data, error } = await supabase
      .from("projects")
      .update(stripped)
      .eq("id", projectId)
      .eq("user_id", userId)
      .select()
      .single());
  }

  if (error) throw error;
  return data as ProjectRecord;
}

// ── Delete ──────────────────────────────────────────────────────────────────

/** Delete project (requires userId for ownership check) */
export async function deleteProject(projectId: string, userId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);

  if (error) throw error;
}

// ── Publish / Gallery toggles ───────────────────────────────────────────────

/**
 * Sentinel thrown when a non-admin tries to add a second project to the
 * public gallery. Callers map this to `notifyPublish.limitReached()` for a
 * friendly toast instead of a generic error.
 *
 * Sharing private links via `published=true` is NOT limited — only the
 * gallery slot is. Authoritative enforcement lives in migration 044's
 * BEFORE trigger; the client-side preflight here just gives instant UX
 * feedback without a write.
 */
export const GALLERY_LIMIT_REACHED = "GALLERY_LIMIT_REACHED";

/** Publish or unpublish a project (controls the share-link, not the gallery). */
export async function togglePublish(projectId: string, published: boolean) {
  const supabase = createClient();

  const updateData = published
    ? { published }
    : { published, in_gallery: false };

  const { data, error } = await supabase
    .from("projects")
    .update(updateData)
    .eq("id", projectId)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectRecord;
}

/**
 * Preflight: would adding `projectId` to the gallery push this user past
 * the one-gallery-project limit? Admins always return false (no limit).
 * Network/DB hiccups also return false — the DB trigger is the real gate.
 */
async function wouldExceedGalleryLimit(
  projectId: string,
): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "super_admin"]);
  if ((roleRows ?? []).length > 0) return false;

  const { count, error: countErr } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("in_gallery", true)
    .neq("id", projectId);
  if (countErr) return false;

  return (count ?? 0) >= 1;
}

/** Toggle gallery visibility (requires project to be published) */
export async function toggleGallery(projectId: string, inGallery: boolean) {
  const supabase = createClient();

  if (inGallery) {
    const { data: project } = await supabase
      .from("projects")
      .select("published")
      .eq("id", projectId)
      .single();

    if (!project?.published) {
      throw new Error("Project must be published before adding to gallery");
    }

    const limitHit = await wouldExceedGalleryLimit(projectId);
    if (limitHit) throw new Error(GALLERY_LIMIT_REACHED);
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ in_gallery: inGallery })
    .eq("id", projectId)
    .select()
    .single();

  if (error) {
    // Map the Postgres trigger's RAISE EXCEPTION to the sentinel so callers
    // get a single uniform code regardless of where the check ran.
    if (
      typeof error.message === "string" &&
      error.message.includes(GALLERY_LIMIT_REACHED)
    ) {
      throw new Error(GALLERY_LIMIT_REACHED);
    }
    throw error;
  }
  return data as ProjectRecord;
}

// ── Tags ─────────────────────────────────────────────────────────────────────

/** Update tags for a project (requires ownership). */
export async function updateProjectTags(
  projectId: string,
  userId: string,
  tags: string[],
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("projects")
    .update({ tags: normalizeTags(tags), updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectRecord;
}
