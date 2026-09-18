/**
 * Blob keys. Every key starts with the owner's id, which is what makes
 * ownership checkable without a database lookup.
 *
 *   <ownerId>/main-images/<projectId>.<ext>
 *   <ownerId>/main-images/<projectId>.thumb.jpg
 *   <ownerId>/context-images/<projectId>/<file>
 *   <ownerId>/context-images/<projectId>/thumbs/<file>
 *   <ownerId>/context-audio/<projectId>/<itemId>.<ext>
 *   <ownerId>/voice-recordings/<projectId>/<recordingId>.<ext>
 *   <ownerId>/temp-transcribe/<id>.<ext>
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const MAX_KEY_LENGTH = 512;

/** Reject traversal, absolute paths and anything a filesystem would reinterpret. */
export function isValidBlobKey(key: string): boolean {
  if (!key || key.length > MAX_KEY_LENGTH) return false;
  if (key.includes("\\") || key.includes("\0")) return false;
  if (key.startsWith("/") || key.endsWith("/")) return false;
  const segments = key.split("/");
  return segments.every((s) => s !== "" && s !== "." && s !== ".." && SEGMENT.test(s));
}

export function assertValidBlobKey(key: string): string {
  if (!isValidBlobKey(key)) throw new Error(`Invalid storage key: ${key}`);
  return key;
}

/** The owner segment of a key, or null when the key is malformed. */
export function ownerOfKey(key: string): string | null {
  if (!isValidBlobKey(key)) return null;
  return key.split("/")[0] ?? null;
}

export function isOwnedBy(key: string, ownerId: string): boolean {
  return ownerOfKey(key) === ownerId;
}

/** Make a user-supplied filename safe to use as one key segment. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 96);
  return cleaned || "file";
}

export function mainImageKey(ownerId: string, projectId: string, ext: string): string {
  return assertValidBlobKey(`${ownerId}/main-images/${projectId}.${ext}`);
}

export function mainThumbnailKey(ownerId: string, projectId: string): string {
  return assertValidBlobKey(`${ownerId}/main-images/${projectId}.thumb.jpg`);
}

export function contextMediaKey(
  ownerId: string,
  projectId: string,
  fileName: string,
): string {
  return assertValidBlobKey(
    `${ownerId}/context-images/${projectId}/${sanitizeFileName(fileName)}`,
  );
}

export function contextThumbnailKey(
  ownerId: string,
  projectId: string,
  fileName: string,
): string {
  return assertValidBlobKey(
    `${ownerId}/context-images/${projectId}/thumbs/${sanitizeFileName(fileName)}`,
  );
}

export function contextAudioKey(
  ownerId: string,
  projectId: string,
  itemId: string,
  ext: string,
): string {
  return assertValidBlobKey(
    `${ownerId}/context-audio/${projectId}/${sanitizeFileName(itemId)}.${ext}`,
  );
}

export function voiceRecordingKey(
  ownerId: string,
  projectId: string,
  recordingId: string,
  ext: string,
): string {
  return assertValidBlobKey(
    `${ownerId}/voice-recordings/${projectId}/${sanitizeFileName(recordingId)}.${ext}`,
  );
}

export function tempTranscribeKey(ownerId: string, id: string, ext: string): string {
  return assertValidBlobKey(`${ownerId}/temp-transcribe/${sanitizeFileName(id)}.${ext}`);
}

export const TEMP_TRANSCRIBE_PREFIX = "temp-transcribe";

export function isTempTranscribeKey(key: string, ownerId: string): boolean {
  return key.startsWith(`${ownerId}/${TEMP_TRANSCRIBE_PREFIX}/`) && isValidBlobKey(key);
}
