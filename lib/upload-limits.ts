/**
 * Upload size limits + per-user storage quota constants.
 *
 * Single source of truth for upload rules. Consumed by both client entry
 * points (image-drop-zone, context-images, audio-file-upload, consent
 * upload) and the server-side API route at /api/storage/upload, so the
 * limit is enforced in two places without any copy drift.
 *
 * `validateUpload` is deliberately pure (no side effects) — callers fire
 * their own toast via `notifyFile.tooLarge(...)` so tests don't need to
 * mock react-hot-toast.
 */

// ────────────────────────────────────────────────────────────────────────────
// Per-file caps by media kind
// ────────────────────────────────────────────────────────────────────────────

export type UploadKind = "image" | "video" | "audio" | "document";

/**
 * Video MIME types we accept. The supabase-js client uploads any blob the
 * browser hands us, but the defensive `/api/storage/upload` route + the main
 * image data-URL regex both need an explicit list. Keep this broad — phones
 * and cameras emit a long tail of containers and the user-facing rule is
 * "if the browser will pick it up, we'll store it." Browsers won't decode all
 * of these for playback, but we still want to keep the original bytes.
 */
export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",     // .mov — iPhone default
  "video/webm",
  "video/x-m4v",         // .m4v
  "video/ogg",           // .ogv
  "video/3gpp",          // .3gp (older Android)
  "video/3gpp2",         // .3g2
  "video/x-matroska",    // .mkv
  "video/x-msvideo",     // .avi
  "video/mpeg",          // .mpeg / .mpg
  "video/mp2t",          // .ts / .m2ts (AVCHD cameras)
  "video/x-ms-wmv",      // .wmv
  "video/x-flv",         // .flv
  "video/hevc",          // .hevc (rare-but-real explicit HEVC)
] as const;

/**
 * MIME → file extension. Used when we generate a storage path from a base64
 * data URL whose MIME subtype isn't a clean extension (e.g. `video/quicktime`
 * → `.mov`, not `.quicktime`). Falls back to the subtype itself when no
 * mapping is known — safe default for `video/mp4` → `mp4`, etc.
 */
const MIME_SUBTYPE_TO_EXT: Record<string, string> = {
  quicktime: "mov",
  "x-m4v": "m4v",
  ogg: "ogv",
  "3gpp": "3gp",
  "3gpp2": "3g2",
  "x-matroska": "mkv",
  "x-msvideo": "avi",
  mpeg: "mpg",
  "mp2t": "ts",
  "x-ms-wmv": "wmv",
  "x-flv": "flv",
  jpeg: "jpg",
};

export function extensionFromMime(mime: string): string {
  const slash = mime.indexOf("/");
  if (slash === -1) return "bin";
  const subtype = mime.slice(slash + 1).toLowerCase();
  return MIME_SUBTYPE_TO_EXT[subtype] ?? subtype;
}

export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
  image: 25 * 1024 * 1024, //  25 MB — 48 MP phone photos + HEIC headroom
  video: 100 * 1024 * 1024, // 100 MB — ~60 s phone clip; larger → URL link
  audio: 60 * 1024 * 1024, //  60 MB — one hour of M4A voice note ~30 MB
  document: 20 * 1024 * 1024, //  20 MB — consent PDFs + scanned forms
};

// Full-project ZIP bundles carry every binary — a project maxed out on the
// per-file limits above lands well under this, so 200 MB is generous headroom
// without inviting zip bombs.
export const IMPORT_ZIP_MAX_BYTES = 200 * 1024 * 1024;

/**
 * Short, user-friendly suggestion to pair with a "too large" toast.
 * Keeps the copy in one place so toasts stay consistent across entry points.
 */
const SUGGESTIONS: Record<UploadKind, string> = {
  image: "Try a smaller copy, or export at a lower resolution.",
  video: "Try compressing, or add the URL as a link instead.",
  audio: "Try a shorter recording, or compress to M4A/MP3.",
  document: "Try a smaller PDF, or compress the scan.",
};

// ────────────────────────────────────────────────────────────────────────────
// Byte formatting
// ────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable byte size — "24.3 MB", "1.0 GB".
 * Uses 1024 (binary) steps, matching how storage quotas are usually priced.
 * Always picks the largest unit that keeps the number ≥ 1.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let i = -1;
  let value = bytes;
  do {
    value /= 1024;
    i++;
  } while (value >= 1024 && i < units.length - 1);
  // Drop trailing ".0" but keep one decimal for non-integer results.
  const rounded = value.toFixed(1);
  const display = rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
  return `${display} ${units[i]}`;
}

// ────────────────────────────────────────────────────────────────────────────
// validateUpload — pure, no side effects.
// ────────────────────────────────────────────────────────────────────────────

export interface ValidateUploadSuccess {
  ok: true;
}

export interface ValidateUploadFailure {
  ok: false;
  /** Ready-to-show toast string. */
  error: string;
  /** Raw parts — callers can rebuild their own message if needed. */
  fileName: string;
  actualBytes: number;
  limitBytes: number;
  kind: UploadKind;
}

export type ValidateUploadResult = ValidateUploadSuccess | ValidateUploadFailure;

/**
 * Check a File (or any { size, name }) against the per-kind cap.
 * Returns `{ ok: true }` on pass; a structured failure on fail.
 *
 * Callers do:
 *   const r = validateUpload(file, "image");
 *   if (!r.ok) { notifyFile.tooLarge(r.fileName, r.actualBytes, r.limitBytes, r.kind); return; }
 */
export function validateUpload(
  file: { size: number; name: string },
  kind: UploadKind,
): ValidateUploadResult {
  const limit = MAX_UPLOAD_BYTES[kind];
  if (file.size <= limit) return { ok: true };
  const error = `${file.name} is ${formatBytes(file.size)} — ${kindLabel(kind)}s must be under ${formatBytes(limit)}. ${SUGGESTIONS[kind]}`;
  return {
    ok: false,
    error,
    fileName: file.name,
    actualBytes: file.size,
    limitBytes: limit,
    kind,
  };
}

/**
 * Lowercase noun for a kind — "image", "video", "audio file", "document".
 * Used by toast copy so we don't write "audios" or "documents" when we mean
 * "audio files" / "documents".
 */
export function kindLabel(kind: UploadKind): string {
  switch (kind) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio file";
    case "document":
      return "document";
  }
}

/**
 * Infer an UploadKind from a MIME type. Used on the server where we only
 * have a File's mime and can't ask the UI what kind of uploader triggered
 * the POST. Defaults to `document` for unrecognised types so unknown
 * uploads get the strictest cap.
 */
export function kindFromMime(mime: string): UploadKind {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

// ────────────────────────────────────────────────────────────────────────────
// Per-user storage quota (tiered)
// ────────────────────────────────────────────────────────────────────────────

export type UserPlan = "free" | "pro" | "team" | "unlimited";

/**
 * Plan → total-storage-bytes mapping. Lives in code (not the DB) so changing
 * the free tier doesn't require a backfill — only this constant + a redeploy.
 */
export const PLAN_QUOTAS: Record<UserPlan, number> = {
  free: 1024 * 1024 * 1024, //     1 GB — doubled from 500 MB after confirming
  //                                   the project is on Supabase Pro (100 GB
  //                                   included). Worst-case exposure with
  //                                   the current user base is well under
  //                                   included storage; see STORAGE-QUOTA.md.
  pro: 10 * 1024 * 1024 * 1024, //    10 GB
  team: 50 * 1024 * 1024 * 1024, //    50 GB
  unlimited: Number.MAX_SAFE_INTEGER,
};

/**
 * Resolve the effective byte limit for a user. Falls back to 'free' for any
 * unrecognised plan name so a future CHECK-constraint mismatch (or a
 * service-role override) can't accidentally open up storage.
 */
export function resolvePlanLimit(plan: string, customLimit: number | null): number {
  if (typeof customLimit === "number" && customLimit > 0) return customLimit;
  if (plan in PLAN_QUOTAS) return PLAN_QUOTAS[plan as UserPlan];
  return PLAN_QUOTAS.free;
}

/**
 * Warning threshold (80 %) for amber UI, and critical threshold (95 %) for
 * red UI. Exported so the badge component and any admin dashboard use the
 * same cutoffs.
 */
export const USAGE_WARN_RATIO = 0.8;
export const USAGE_CRITICAL_RATIO = 0.95;
