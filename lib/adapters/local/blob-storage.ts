/**
 * Local blob storage: files under <dataDir>/blobs/<bucket>/<key>, with a
 * sidecar for the content type so downloads keep their media type.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import type {
  BlobObject,
  BlobStat,
  BlobStoragePort,
  BucketName,
  ByteRange,
} from "@/lib/ports/blob-storage";
import { assertValidBlobKey } from "@/lib/storage/keys";

interface BlobMeta {
  contentType: string;
  size: number;
  updatedAt: string;
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

export function createLocalBlobStorage(dataDir: string): BlobStoragePort {
  const root = join(dataDir, "blobs");
  const metaRoot = join(dataDir, "blobs-meta");

  const blobPath = (bucket: BucketName, key: string) =>
    join(root, bucket, ...assertValidBlobKey(key).split("/"));
  const metaPath = (bucket: BucketName, key: string) =>
    `${join(metaRoot, bucket, ...assertValidBlobKey(key).split("/"))}.json`;

  async function readMeta(bucket: BucketName, key: string): Promise<BlobMeta | null> {
    try {
      return JSON.parse(await readFile(metaPath(bucket, key), "utf8")) as BlobMeta;
    } catch {
      return null;
    }
  }

  function etagFor(size: number, mtimeMs: number): string {
    return `W/"${size}-${Math.floor(mtimeMs)}"`;
  }

  return {
    async put(bucket, key, body, meta) {
      const target = blobPath(bucket, key);
      await mkdir(dirname(target), { recursive: true });
      const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(tmp, body);
      await rename(tmp, target);

      const metaTarget = metaPath(bucket, key);
      await mkdir(dirname(metaTarget), { recursive: true });
      await writeFile(
        metaTarget,
        JSON.stringify({
          contentType: meta.contentType,
          size: body.byteLength,
          updatedAt: new Date().toISOString(),
        } satisfies BlobMeta),
      );

      const stats = await stat(target);
      return { size: body.byteLength, etag: etagFor(stats.size, stats.mtimeMs) };
    },

    async get(bucket, key, range?: ByteRange): Promise<BlobObject | null> {
      const target = blobPath(bucket, key);
      let stats;
      try {
        stats = await stat(target);
      } catch {
        return null;
      }

      const meta = await readMeta(bucket, key);
      const start = range?.start ?? 0;
      const end = Math.min(range?.end ?? stats.size - 1, stats.size - 1);
      if (start >= stats.size || start > end) return null;

      const nodeStream = createReadStream(target, { start, end });
      return {
        stream: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
        contentType: meta?.contentType ?? "application/octet-stream",
        size: end - start + 1,
        totalSize: stats.size,
        etag: etagFor(stats.size, stats.mtimeMs),
        lastModified: new Date(stats.mtimeMs).toUTCString(),
      };
    },

    async head(bucket, key): Promise<BlobStat | null> {
      try {
        const stats = await stat(blobPath(bucket, key));
        const meta = await readMeta(bucket, key);
        return {
          size: stats.size,
          contentType: meta?.contentType ?? "application/octet-stream",
          etag: etagFor(stats.size, stats.mtimeMs),
        };
      } catch {
        return null;
      }
    },

    async copy(bucket, fromKey, toKey) {
      const target = blobPath(bucket, toKey);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(blobPath(bucket, fromKey), target);

      const meta = await readMeta(bucket, fromKey);
      if (meta) {
        const metaTarget = metaPath(bucket, toKey);
        await mkdir(dirname(metaTarget), { recursive: true });
        await writeFile(metaTarget, JSON.stringify(meta));
      }
    },

    async delete(bucket, keys) {
      for (const key of keys) {
        await rm(blobPath(bucket, key), { force: true });
        await rm(metaPath(bucket, key), { force: true });
      }
    },

    async usageForOwner(ownerId) {
      let bytes = 0;
      let objects = 0;
      for (const bucket of ["context-media", "voice-recordings", "consent-documents"] as BucketName[]) {
        const prefix = join(root, bucket, ownerId);
        for (const file of await walk(prefix)) {
          if (file.endsWith(".tmp")) continue;
          try {
            bytes += (await stat(file)).size;
            objects += 1;
          } catch {
            /* vanished mid-walk */
          }
        }
      }
      return { bytes, objects };
    },
  };
}
