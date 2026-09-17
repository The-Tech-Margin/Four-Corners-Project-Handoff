/**
 * Database operations for links
 */

import { createClient } from "@/lib/supabase/client";
import type { FourCornersLink as Link } from "@/lib/schema";

type SupabaseClient = ReturnType<typeof createClient>;
function getDb(sb?: SupabaseClient) { return sb ?? createClient(); }

export interface LinkRecord {
  id: string;
  project_id: string;
  title: string;
  url: string;
  source?: string;
  position: number;
  created_at?: string;
}

/**
 * Create link
 */
export async function createLink(
  projectId: string,
  link: Link,
  position: number,
  sb?: SupabaseClient,
) {
  const supabase = getDb(sb);

  const record: Omit<LinkRecord, "id" | "created_at"> = {
    project_id: projectId,
    title: link.title,
    url: link.url,
    source: link.source,
    position,
  };

  const { data, error } = await supabase
    .from("links")
    .insert(record)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get links for project
 */
export async function getLinks(projectId: string, sb?: SupabaseClient) {
  const supabase = getDb(sb);

  const { data, error } = await supabase
    .from("links")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Update link
 */
export async function updateLink(linkId: string, updates: Partial<Link>, sb?: SupabaseClient) {
  const supabase = getDb(sb);

  const record: Partial<LinkRecord> = {
    title: updates.title,
    url: updates.url,
    source: updates.source,
  };

  const { data, error } = await supabase
    .from("links")
    .update(record)
    .eq("id", linkId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete link
 */
export async function deleteLink(linkId: string, sb?: SupabaseClient) {
  const supabase = getDb(sb);

  const { error } = await supabase.from("links").delete().eq("id", linkId);

  if (error) throw error;
}

/**
 * Delete all links for a project
 */
export async function deleteAllLinks(projectId: string, sb?: SupabaseClient) {
  const supabase = getDb(sb);

  const { error } = await supabase.from("links").delete().eq("project_id", projectId);

  if (error) throw error;
}
