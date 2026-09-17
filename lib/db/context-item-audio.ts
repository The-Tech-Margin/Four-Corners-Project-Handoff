/**
 * Database operations for context_item_audio junction table
 */

import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;
function getDb(sb?: SupabaseClient) { return sb ?? createClient(); }

export interface ContextItemAudioRecord {
  id: string;
  context_item_id: string;
  voice_transcription_id?: string;
  storage_path?: string;
  storage_url?: string;
  mime_type?: string;
  duration?: number;
  position: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create a context item audio record
 */
export async function createContextItemAudio(
  contextItemId: string,
  audio: {
    voiceTranscriptionId?: string;
    storagePath?: string;
    storageUrl?: string;
    mimeType?: string;
    duration?: number;
    position?: number;
  },
  sb?: SupabaseClient,
) {
  const supabase = getDb(sb);

  const record = {
    context_item_id: contextItemId,
    voice_transcription_id: audio.voiceTranscriptionId,
    storage_path: audio.storagePath,
    storage_url: audio.storageUrl,
    mime_type: audio.mimeType,
    duration: audio.duration,
    position: audio.position ?? 0,
  };

  const { data, error } = await supabase
    .from("context_item_audio")
    .insert(record)
    .select()
    .single();

  if (error) throw error;
  return data as ContextItemAudioRecord;
}

/**
 * Get audio records for a context item
 */
export async function getContextItemAudio(contextItemId: string, sb?: SupabaseClient) {
  const supabase = getDb(sb);

  const { data, error } = await supabase
    .from("context_item_audio")
    .select("*")
    .eq("context_item_id", contextItemId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data as ContextItemAudioRecord[];
}

/**
 * Delete all audio records for a context item
 */
export async function deleteContextItemAudio(contextItemId: string, sb?: SupabaseClient) {
  const supabase = getDb(sb);

  const { error } = await supabase
    .from("context_item_audio")
    .delete()
    .eq("context_item_id", contextItemId);

  if (error) throw error;
}
