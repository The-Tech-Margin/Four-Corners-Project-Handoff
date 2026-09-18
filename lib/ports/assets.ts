/**
 * The per-owner asset library: one row per uploaded blob, which is also how
 * storage usage is counted.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { BucketName } from "./blob-storage";

export type AssetMediaType = "image" | "video" | "audio" | "document";

export interface StoredAsset {
  id: string;
  ownerId: string;
  mediaType: AssetMediaType;
  mimeType: string;
  fileName: string;
  bucket: BucketName;
  key: string;
  thumbnailKey: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: string;
}

export type NewAsset = Omit<StoredAsset, "id" | "ownerId" | "createdAt">;

export interface ListAssetsOptions {
  query?: string;
  mediaTypes?: AssetMediaType[];
  sort?: "newest" | "oldest";
  limit?: number;
  offset?: number;
}

export interface UserAssetRepository {
  /** Upsert on (ownerId, bucket, key) — re-uploading a file is not a new asset. */
  record(ownerId: string, asset: NewAsset): Promise<StoredAsset>;
  attachThumbnail(
    ownerId: string,
    bucket: BucketName,
    key: string,
    thumbnailKey: string,
  ): Promise<void>;
  list(
    ownerId: string,
    options: ListAssetsOptions,
  ): Promise<{ assets: StoredAsset[]; hasMore: boolean }>;
  findByKey(ownerId: string, bucket: BucketName, key: string): Promise<StoredAsset | null>;
  delete(ownerId: string, assetId: string): Promise<StoredAsset | null>;
  totalBytes(ownerId: string): Promise<number>;
}
