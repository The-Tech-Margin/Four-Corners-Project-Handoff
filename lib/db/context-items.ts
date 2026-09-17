/**
 * Database operations for context items
 */

import { createClient } from "@/lib/supabase/client";
import type { FourCornersContextItem as ContextItem } from "@/lib/schema";

type SupabaseClient = ReturnType<typeof createClient>;
function getDb(sb?: SupabaseClient) { return sb ?? createClient(); }

export interface ContextItemRecord {
  id: string;
  project_id: string;
  source_type: "upload" | "url";
  filename?: string;
  mime_type?: string;
  caption: string;
  media_type: "image" | "video";
  storage_path?: string;
  thumbnail_storage_path?: string;
  storage_url?: string;
  thumbnail_storage_url?: string;
  url?: string;
  position: number;
  description?: string;
  credit?: string;
  date?: string;
  audio_storage_path?: string;
  audio_storage_url?: string;
  audio_mime_type?: string;
  audio_duration?: number;
  linked_project_id?: string;
  linked_project_slug?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create context item
 */
export async function createContextItem(
  projectId: string,
  item: ContextItem,
  position: number,
  sb?: SupabaseClient,
) {
  const supabase = getDb(sb);

  const record: Omit<ContextItemRecord, "id" | "created_at" | "updated_at"> = {
    project_id: projectId,
    source_type: item.sourceType,
    filename: item.filename,
    mime_type: item.mimeType,
    caption: item.caption,
    media_type: item.type,
    url: item.url,
    storage_path: item.storage_path,
    thumbnail_storage_path: item.thumbnail_storage_path,
    storage_url: item.storage_url,
    thumbnail_storage_url: item.thumbnail_storage_url,
    description: item.description,
    credit: item.credit,
    date: item.date,
    audio_storage_path: item.audioStoragePath,
    audio_storage_url: item.audioStorageUrl,
    audio_mime_type: item.audioMimeType,
    audio_duration: item.audioDuration,
    linked_project_id: item.linkedProjectId,
    linked_project_slug: item.linkedProjectSlug,
    position,
  };

  const { data, error } = await supabase
    .from("context_items")
    .insert(record)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get context items for project
 */
export async function getContextItems(projectId: string, sb?: SupabaseClient) {
  const supabase = getDb(sb);

  const { data, error } = await supabase
    .from("context_items")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Update context item
 */
export async function updateContextItem(
  itemId: string,
  updates: Partial<ContextItem>,
  sb?: SupabaseClient,
) {
  const supabase = getDb(sb);

  const record: Partial<ContextItemRecord> = {
    caption: updates.caption,
    url: updates.url,
    description: updates.description,
    credit: updates.credit,
    date: updates.date,
  };

  const { data, error } = await supabase
    .from("context_items")
    .update(record)
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete context item
 */
export async function deleteContextItem(itemId: string, sb?: SupabaseClient) {
  const supabase = getDb(sb);

  const { error } = await supabase
    .from("context_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;
}

/**
 * Delete all context items for a project
 */
export async function deleteAllContextItems(projectId: string, sb?: SupabaseClient) {
  const supabase = getDb(sb);

  const { error } = await supabase
    .from("context_items")
    .delete()
    .eq("project_id", projectId);

  if (error) throw error;
}

/**
 * Sync context items: upsert existing, insert new, delete removed.
 * Preserves rows (and their CASCADE children like context_item_audio)
 * instead of the destructive delete-all + recreate pattern.
 */
export async function syncContextItems(
  projectId: string,
  items: ContextItem[],
  sb?: SupabaseClient,
) {
  const supabase = getDb(sb);

  // Fetch current DB rows
  const existing = await getContextItems(projectId, sb);
  const existingIds = new Set<string>((existing || []).map((r: { id: string }) => r.id));
  const incomingIds = new Set<string>(items.filter((i) => i.id).map((i) => i.id));

  // Delete items that were removed by the user
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("context_items")
      .delete()
      .in("id", toDelete);
    if (error) throw error;
  }

  // Upsert each item (update existing, insert new)
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const record = {
      project_id: projectId,
      source_type: item.sourceType,
      filename: item.filename,
      mime_type: item.mimeType,
      caption: item.caption,
      media_type: item.type,
      url: item.url,
      storage_path: item.storage_path,
      thumbnail_storage_path: item.thumbnail_storage_path,
      storage_url: item.storage_url,
      thumbnail_storage_url: item.thumbnail_storage_url,
      description: item.description,
      credit: item.credit,
      date: item.date,
      audio_storage_path: item.audioStoragePath,
      audio_storage_url: item.audioStorageUrl,
      audio_mime_type: item.audioMimeType,
      audio_duration: item.audioDuration,
      linked_project_id: item.linkedProjectId,
      linked_project_slug: item.linkedProjectSlug,
      position: i,
    };

    if (item.id && existingIds.has(item.id)) {
      // Update existing row
      const { error } = await supabase
        .from("context_items")
        .update(record)
        .eq("id", item.id);
      if (error) throw error;
    } else {
      // Insert new row (with or without client-generated id)
      const insertRecord = item.id ? { id: item.id, ...record } : record;
      const { error } = await supabase
        .from("context_items")
        .insert(insertRecord);
      if (error) throw error;
    }
  }
}

/**
 * Reorder context items
 */
export async function reorderContextItems(
  projectId: string,
  itemIds: string[],
  sb?: SupabaseClient,
) {
  const supabase = getDb(sb);

  const updates = itemIds.map((id, index) => ({
    id,
    position: index,
  }));

  for (const update of updates) {
    await supabase
      .from("context_items")
      .update({ position: update.position })
      .eq("id", update.id)
      .eq("project_id", projectId);
  }
}
