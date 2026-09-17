/**
 * Database operations for voice_transcriptions (normalized table)
 */

import { createClient } from "@/lib/supabase/client";
import type { VoiceTranscription } from "@/lib/field-registry";

type SupabaseClient = ReturnType<typeof createClient>;
function getDb(sb?: SupabaseClient) { return sb ?? createClient(); }

export interface VoiceTranscriptionRecord {
  id: string;
  project_id: string;
  recording_id: string;
  text: string;
  transcribed_at: string;
  field_id?: string;
  audio_storage_path?: string;
  audio_storage_url?: string;
  mime_type?: string;
  duration?: number;
  position: number;
  created_at?: string;
}

/**
 * Create a single voice transcription record
 */
export async function createVoiceTranscription(
  projectId: string,
  transcription: VoiceTranscription,
  position: number,
  sb?: SupabaseClient,
) {
  const supabase = getDb(sb);

  const record = {
    project_id: projectId,
    recording_id: transcription.recordingId,
    text: transcription.text,
    transcribed_at: transcription.transcribedAt,
    field_id: transcription.fieldId,
    audio_storage_path: transcription.audioStoragePath,
    audio_storage_url: transcription.audioStorageUrl,
    mime_type: transcription.mimeType,
    duration: transcription.duration,
    position,
  };

  const { data, error } = await supabase
    .from("voice_transcriptions")
    .insert(record)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get voice transcriptions for a project
 */
export async function getVoiceTranscriptions(
  projectId: string,
  sb?: SupabaseClient,
): Promise<VoiceTranscriptionRecord[]> {
  const supabase = getDb(sb);

  const { data, error } = await supabase
    .from("voice_transcriptions")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Find an existing (non-empty) transcription for a given audio storage path.
 * Used when re-adding a library audio asset that was already transcribed in
 * another project — so the user can reuse it instead of paying to re-transcribe.
 * RLS scopes this to the current user's own transcriptions.
 */
export async function getTranscriptionTextByAudioPath(
  audioStoragePath: string,
  sb?: SupabaseClient,
): Promise<string | null> {
  if (!audioStoragePath) return null;
  const supabase = getDb(sb);

  const { data, error } = await supabase
    .from("voice_transcriptions")
    .select("text")
    .eq("audio_storage_path", audioStoragePath)
    .neq("text", "")
    .order("transcribed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.text || null;
}

/**
 * Delete all voice transcriptions for a project
 */
export async function deleteAllVoiceTranscriptions(
  projectId: string,
  sb?: SupabaseClient,
) {
  const supabase = getDb(sb);

  const { error } = await supabase
    .from("voice_transcriptions")
    .delete()
    .eq("project_id", projectId);

  if (error) throw error;
}
