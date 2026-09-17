import { createClient } from "@/lib/supabase/client";
import { getAudioFormat } from "@/lib/audio-utils";

export interface SupabaseAudioUploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

/**
 * Upload audio recording to Supabase Storage
 * @param blob Audio blob to upload
 * @param mimeType MIME type of the audio
 * @param userId User ID for organizing files
 * @param fileName Optional custom filename
 */
export async function uploadAudioToSupabase(
  blob: Blob,
  mimeType: string,
  userId: string,
  fileName?: string
): Promise<SupabaseAudioUploadResult> {
  const supabase = createClient();

  if (!supabase) {
    return {
      success: false,
      error: "Supabase not configured",
    };
  }

  try {
    // Generate filename if not provided
    const timestamp = Date.now();
    const format = getAudioFormat(mimeType);
    const finalFileName = fileName || `voice-${timestamp}.${format.extension}`;

    // Create path: audio/{userId}/{filename}
    const filePath = `audio/${userId}/${finalFileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from("recordings")
      .upload(filePath, blob, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("recordings")
      .getPublicUrl(filePath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: filePath,
    };
  } catch (error) {
    console.error("Upload failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Delete audio recording from Supabase Storage
 */
export async function deleteAudioFromSupabase(
  filePath: string
): Promise<boolean> {
  const supabase = createClient();

  if (!supabase) {
    return false;
  }

  try {
    const { error } = await supabase.storage
      .from("recordings")
      .remove([filePath]);

    if (error) {
      console.error("Supabase delete error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Delete failed:", error);
    return false;
  }
}

/**
 * List user's audio recordings from Supabase Storage
 */
export async function listUserAudioRecordings(userId: string) {
  const supabase = createClient();

  if (!supabase) {
    return { success: false, files: [], error: "Supabase not configured" };
  }

  try {
    const { data, error } = await supabase.storage
      .from("recordings")
      .list(`audio/${userId}`, {
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) {
      console.error("Supabase list error:", error);
      return { success: false, files: [], error: error.message };
    }

    return { success: true, files: data || [], error: null };
  } catch (error) {
    console.error("List failed:", error);
    return {
      success: false,
      files: [],
      error: error instanceof Error ? error.message : "List failed",
    };
  }
}

/**
 * Download audio recording from Supabase Storage
 */
export async function downloadAudioFromSupabase(
  filePath: string
): Promise<Blob | null> {
  const supabase = createClient();

  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from("recordings")
      .download(filePath);

    if (error) {
      console.error("Supabase download error:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Download failed:", error);
    return null;
  }
}

/**
 * Check if Supabase storage is available and configured
 */
export async function checkSupabaseStorageAvailable(): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;

  try {
    // Try to list buckets to check connection
    const { data, error } = await supabase.storage.listBuckets();
    return !error && data !== null;
  } catch (error) {
    return false;
  }
}
