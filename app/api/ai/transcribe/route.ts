import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServer } from "@supabase/supabase-js";
import { AI_GATEWAY_CONFIG } from "@/lib/ai-gateway";
import {
  getAudioFormat,
  extractBase64FromDataUrl,
  isAudioMimeTypeSupported,
} from "@/lib/audio-utils";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

// Give the serverless function enough time to receive + transcribe large audio
export const maxDuration = 300; // 5 minutes

/**
 * Map our MIME types to the format strings gpt-4o-audio-preview accepts.
 * It only supports "wav" and "mp3"; for everything else we fall back to "wav".
 */
function toAudioPreviewFormat(
  mimeType: string | undefined,
): "wav" | "mp3" {
  if (!mimeType) return "wav";
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  // webm, ogg, mp4 — default to wav (GPT-4o-audio-preview is lenient)
  return "wav";
}

/**
 * When Whisper returns no speech, ask GPT-4o-audio-preview to describe
 * the soundscape instead.
 */
async function describeAudio(
  audioBase64: string,
  mimeType: string | undefined,
  openaiKey: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-audio-preview",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "This audio recording contains no recognizable speech. Describe the sounds you hear in 1-3 concise sentences using plain descriptive English text only. Focus on identifying the type of environment, notable sounds, and overall mood or atmosphere. Do NOT use emojis, unicode symbols, or special characters — words only. Start your description directly — do not prefix with labels like 'Soundscape:' or 'Description:'.",
                },
                {
                  type: "input_audio",
                  input_audio: {
                    data: audioBase64,
                    format: toAudioPreviewFormat(mimeType),
                  },
                },
              ],
            },
          ],
          max_tokens: 300,
        }),
      },
    );

    if (!response.ok) {
      console.warn(
        "Audio description fallback failed:",
        response.status,
        await response.text(),
      );
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn("Audio description fallback error:", err);
    return null;
  }
}

/**
 * Helper: download a file from Supabase Storage using the service role key.
 * Returns the raw Buffer.
 */
async function downloadFromStorage(storagePath: string): Promise<Buffer> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getSupabaseSecretKey();

  if (!url || !serviceKey) {
    throw new Error("Supabase service role credentials not configured");
  }

  const supabase = createSupabaseServer(url, serviceKey);
  const { data, error } = await supabase.storage
    .from("voice-recordings")
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message || "no data"}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

/**
 * Helper: delete a temp file from Supabase Storage (fire-and-forget).
 */
function cleanupStorageFile(storagePath: string) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getSupabaseSecretKey();
  if (!url || !serviceKey) return;

  const supabase = createSupabaseServer(url, serviceKey);
  supabase.storage
    .from("voice-recordings")
    .remove([storagePath])
    .catch((err) => console.warn("Temp file cleanup failed:", err));
}

export async function POST(request: NextRequest) {
  let tempStoragePath: string | null = null;

  try {
    const contentType = request.headers.get("content-type") || "";

    let audioBuffer: Buffer;
    let mimeType: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      // ── Small file: sent directly via FormData (≤4 MB) ──
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { error: "Audio file is required" },
          { status: 400 },
        );
      }

      mimeType =
        (formData.get("mimeType") as string | null) || file.type || undefined;
      audioBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      // ── JSON path: either storagePath (large file) or audioDataUrl (legacy) ──
      const body = await request.json();

      if (body.storagePath) {
        // Large file: already uploaded to Supabase Storage by the client
        tempStoragePath = body.storagePath;
        mimeType = body.mimeType;
        audioBuffer = await downloadFromStorage(body.storagePath);
      } else if (body.audioDataUrl) {
        // Legacy: base64 data URL in JSON body
        const base64Data = extractBase64FromDataUrl(body.audioDataUrl);
        if (!base64Data) {
          return NextResponse.json(
            { error: "Invalid audio data URL format" },
            { status: 400 },
          );
        }
        mimeType = body.mimeType;
        audioBuffer = Buffer.from(base64Data, "base64");
      } else {
        return NextResponse.json(
          { error: "Audio file, storagePath, or audioDataUrl is required" },
          { status: 400 },
        );
      }
    }

    // Validate MIME type is supported
    if (mimeType && !isAudioMimeTypeSupported(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported audio format: ${mimeType}` },
        { status: 400 },
      );
    }

    // Get format details using centralized utility
    const format = getAudioFormat(mimeType);

    // Create form data for OpenAI Whisper transcription
    const openaiForm = new FormData();
    const uint8 = new Uint8Array(audioBuffer);
    openaiForm.append(
      "file",
      new Blob([uint8], { type: format.mimeType }),
      `audio.${format.extension}`,
    );
    openaiForm.append("model", AI_GATEWAY_CONFIG.transcriptionModel);

    // Use OpenAI API directly
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY environment variable is not set" },
        { status: 500 },
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: openaiForm,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI transcription error:", response.status, errorText);

      let errorMessage = "Failed to transcribe audio";

      if (response.status === 429) {
        errorMessage =
          "Rate limit exceeded. Please wait a moment and try again. If this persists, check your OpenAI API quota.";
      } else if (response.status === 401) {
        errorMessage =
          "Invalid API key. Please check your OPENAI_API_KEY configuration.";
      } else if (response.status === 400) {
        errorMessage = "Invalid audio format. Please try recording again.";
      } else {
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch {
          errorMessage = `Transcription failed: ${errorText.substring(0, 100)}`;
        }
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status },
      );
    }

    const data = await response.json();
    const whisperText = (data.text || "").trim();

    // ── Soundscape fallback ──
    // If Whisper returned no speech, ask GPT-4o-audio-preview to describe
    // what it hears (ambient sounds, music, nature, etc.)
    // Cap at 20 MB — the chat completions API can't handle arbitrarily large audio
    const SOUNDSCAPE_MAX_BYTES = 20 * 1024 * 1024;

    if (!whisperText && audioBuffer.length <= SOUNDSCAPE_MAX_BYTES) {
      const audioBase64 = audioBuffer.toString("base64");
      const description = await describeAudio(audioBase64, mimeType, openaiKey);

      if (description) {
        if (tempStoragePath) cleanupStorageFile(tempStoragePath);
        return NextResponse.json({
          text: `[Soundscape] ${description}`,
          type: "soundscape",
        });
      }
    }

    // Clean up temp storage file
    if (tempStoragePath) cleanupStorageFile(tempStoragePath);

    if (!whisperText) {
      return NextResponse.json({
        text: "",
        type: "empty",
      });
    }

    return NextResponse.json({ text: whisperText, type: "speech" });
  } catch (error) {
    // Clean up temp storage file on error too
    if (tempStoragePath) cleanupStorageFile(tempStoragePath);

    console.error("Error in audio transcription:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
