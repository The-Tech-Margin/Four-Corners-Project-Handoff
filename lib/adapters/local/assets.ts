/**
 * Local asset library: one row per uploaded blob, which is also how storage
 * usage is counted.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { randomUUID } from "node:crypto";
import type {
  ListAssetsOptions,
  NewAsset,
  StoredAsset,
  UserAssetRepository,
} from "@/lib/ports/assets";
import { JsonStore } from "./json-store";

export function createLocalAssetRepository(dataDir: string): UserAssetRepository {
  const store = new JsonStore<StoredAsset>(dataDir, "assets");

  return {
    async record(ownerId, asset: NewAsset) {
      return store.mutate((rows) => {
        const index = rows.findIndex(
          (row) =>
            row.ownerId === ownerId && row.bucket === asset.bucket && row.key === asset.key,
        );

        if (index !== -1) {
          const merged: StoredAsset = { ...rows[index], ...asset };
          const next = [...rows];
          next[index] = merged;
          return { rows: next, result: merged };
        }

        const created: StoredAsset = {
          ...asset,
          id: randomUUID(),
          ownerId,
          createdAt: new Date().toISOString(),
        };
        return { rows: [...rows, created], result: created };
      });
    },

    async attachThumbnail(ownerId, bucket, key, thumbnailKey) {
      await store.mutate((rows) => {
        const index = rows.findIndex(
          (row) => row.ownerId === ownerId && row.bucket === bucket && row.key === key,
        );
        if (index === -1) return { rows, result: undefined };
        const next = [...rows];
        next[index] = { ...next[index], thumbnailKey };
        return { rows: next, result: undefined };
      });
    },

    async list(ownerId, options: ListAssetsOptions) {
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;
      const query = options.query?.trim().toLowerCase();

      const matching = store
        .read()
        .filter((row) => row.ownerId === ownerId)
        .filter((row) =>
          options.mediaTypes?.length ? options.mediaTypes.includes(row.mediaType) : true,
        )
        .filter((row) => (query ? row.fileName.toLowerCase().includes(query) : true))
        .sort((a, b) =>
          options.sort === "oldest"
            ? a.createdAt < b.createdAt
              ? -1
              : 1
            : a.createdAt < b.createdAt
              ? 1
              : -1,
        );

      return {
        assets: matching.slice(offset, offset + limit),
        hasMore: matching.length > offset + limit,
      };
    },

    async findByKey(ownerId, bucket, key) {
      return (
        store
          .read()
          .find(
            (row) => row.ownerId === ownerId && row.bucket === bucket && row.key === key,
          ) ?? null
      );
    },

    async delete(ownerId, assetId) {
      return store.mutate((rows) => {
        const target = rows.find((row) => row.id === assetId && row.ownerId === ownerId);
        if (!target) return { rows, result: null };
        return { rows: rows.filter((row) => row.id !== assetId), result: target };
      });
    },

    async totalBytes(ownerId) {
      return store
        .read()
        .filter((row) => row.ownerId === ownerId)
        .reduce((total, row) => total + (row.fileSize ?? 0), 0);
    },
  };
}
