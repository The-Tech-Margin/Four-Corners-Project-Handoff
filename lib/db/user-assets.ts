/**
 * User Assets — per-user cross-project library of uploaded media.
 *
 * Reads + writes against the `user_assets` table (migration 036). RLS ensures
 * every query is automatically scoped to the authenticated user; we do NOT
 * filter by user_id in these queries (let the DB enforce it).
 *
 * recordAsset() is called fire-and-forget from upload helpers:
 * errors are logged, never thrown, so a failed library insert never breaks
 * a successful upload. The unique (user_id, storage_path) constraint makes
 * it safe to call from multiple code paths.
 */

import { createClient } from "@/lib/supabase/client";
import type { UserAsset, UserAssetMediaType } from "@/lib/field-registry";

/**
 * Row shape as stored in the database (snake_case).
 */
interface UserAssetRow {
  id: string;
  user_id: string;
  media_type: UserAssetMediaType;
  mime_type: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  storage_url: string;
  thumbnail_storage_path: string | null;
  thumbnail_storage_url: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  created_at: string;
}

function rowToUserAsset(row: UserAssetRow): UserAsset {
  return {
    id: row.id,
    userId: row.user_id,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    fileName: row.file_name,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    storageUrl: row.storage_url,
    thumbnailStoragePath: row.thumbnail_storage_path,
    thumbnailStorageUrl: row.thumbnail_storage_url,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    duration: row.duration,
    createdAt: row.created_at,
  };
}

/**
 * Shape for inserting a new asset. user_id is resolved from the session.
 */
export interface RecordAssetInput {
  mediaType: UserAssetMediaType;
  mimeType: string;
  fileName: string;
  storageBucket: string;
  storagePath: string;
  storageUrl: string;
  thumbnailStoragePath?: string | null;
  thumbnailStorageUrl?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}

/**
 * Record a single uploaded asset in the user's library.
 *
 * Idempotent — safe to call multiple times for the same storage_path.
 * Fire-and-forget: logs errors but never throws.
 */
export async function recordAsset(input: RecordAssetInput): Promise<void> {
  try {
    const supabase = createClient();
    if (!supabase) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("user_assets").upsert(
      {
        user_id: user.id,
        media_type: input.mediaType,
        mime_type: input.mimeType,
        file_name: input.fileName,
        storage_bucket: input.storageBucket,
        storage_path: input.storagePath,
        storage_url: input.storageUrl,
        thumbnail_storage_path: input.thumbnailStoragePath ?? null,
        thumbnail_storage_url: input.thumbnailStorageUrl ?? null,
        file_size: input.fileSize ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        duration: input.duration ?? null,
      },
      { onConflict: "user_id,storage_path", ignoreDuplicates: false },
    );

    if (error) {
      console.warn("recordAsset: failed to index user asset", error);
    }
  } catch (err) {
    console.warn("recordAsset: unexpected error", err);
  }
}

export interface ListUserAssetsOptions {
  query?: string;
  mediaTypes?: UserAssetMediaType[];
  sort?: "newest" | "oldest";
  limit?: number;
  offset?: number;
}

export interface ListUserAssetsResult {
  assets: UserAsset[];
  hasMore: boolean;
}

/**
 * List the current user's assets, optionally filtered by type + search query.
 *
 * Search uses ILIKE on file_name (trigram index exists for larger libraries;
 * ILIKE is still the correct operator and will use the trigram gin index).
 */
export async function listUserAssets(
  opts: ListUserAssetsOptions = {},
): Promise<ListUserAssetsResult> {
  const supabase = createClient();
  if (!supabase) return { assets: [], hasMore: false };

  const limit = opts.limit ?? 40;
  const offset = opts.offset ?? 0;
  const sort = opts.sort ?? "newest";

  let q = supabase.from("user_assets").select("*");

  if (opts.mediaTypes && opts.mediaTypes.length > 0) {
    q = q.in("media_type", opts.mediaTypes);
  }

  if (opts.query && opts.query.trim().length > 0) {
    // Escape Postgres wildcards the user types; ILIKE treats %/_ specially.
    const escaped = opts.query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    q = q.ilike("file_name", `%${escaped}%`);
  }

  q = q.order("created_at", { ascending: sort === "oldest" });

  // Request one extra row to detect hasMore without a separate count query.
  q = q.range(offset, offset + limit);

  const { data, error } = await q;
  if (error) {
    console.error("listUserAssets error:", error);
    return { assets: [], hasMore: false };
  }

  const rows = (data ?? []) as UserAssetRow[];
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  return {
    assets: trimmed.map(rowToUserAsset),
    hasMore,
  };
}

/**
 * Delete a single asset from the library. Does NOT delete the underlying
 * storage object — caller is responsible for that if desired. v1 does not
 * expose this in the UI; included for future use (v1.1 delete flow).
 */
export async function deleteUserAsset(assetId: string): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("user_assets")
    .delete()
    .eq("id", assetId);

  if (error) {
    console.error("deleteUserAsset error:", error);
    return false;
  }
  return true;
}
