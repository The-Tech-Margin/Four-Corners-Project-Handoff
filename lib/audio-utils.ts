/**
 * Shared Audio Format Utilities
 * Centralized MIME type handling and validation
 *
 * @author TheTechMargin
 */

export interface AudioFormat {
  extension: string;
  mimeType: string;
}

/**
 * Get audio format details from MIME type
 * Centralizes MIME type detection logic (DRY principle)
 */
export function getAudioFormat(mimeType: string | undefined): AudioFormat {
  const type = mimeType?.toLowerCase() || "";

  if (type.includes("mp4") || type.includes("m4a")) {
    return { extension: "m4a", mimeType: "audio/mp4" };
  }

  if (type.includes("mpeg") || type.includes("mp3")) {
    return { extension: "mp3", mimeType: "audio/mpeg" };
  }

  if (type.includes("ogg")) {
    return { extension: "ogg", mimeType: "audio/ogg" };
  }

  if (type.includes("wav")) {
    return { extension: "wav", mimeType: "audio/wav" };
  }

  // Default to webm (most common for web recording)
  return { extension: "webm", mimeType: "audio/webm" };
}

/**
 * Validate and extract base64 data from data URL
 */
export function extractBase64FromDataUrl(dataUrl: string): string | null {
  if (!dataUrl || typeof dataUrl !== "string") {
    return null;
  }

  const parts = dataUrl.split(",");
  if (parts.length !== 2) {
    return null;
  }

  const base64Data = parts[1];
  if (!base64Data || base64Data.length === 0) {
    return null;
  }

  return base64Data;
}

/**
 * Check if MIME type is supported for transcription
 * OpenAI Whisper supports: mp3, mp4, mpeg, mpga, m4a, wav, webm
 */
export function isAudioMimeTypeSupported(
  mimeType: string | undefined
): boolean {
  if (!mimeType) return false;

  const type = mimeType.toLowerCase();
  const supported = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg"];

  return supported.some((format) => type.includes(format));
}
