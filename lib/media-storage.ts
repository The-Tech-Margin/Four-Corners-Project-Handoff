import { openDB, DBSchema, IDBPDatabase } from "idb";

interface MediaBlob {
  id?: number;
  blob: Blob;
  mimeType: string;
  filename: string;
  timestamp: number;
}

interface FourCornersMediaDB extends DBSchema {
  blobs: {
    key: number;
    value: MediaBlob;
    indexes: { timestamp: number };
  };
}

class MediaStorage {
  private dbPromise: Promise<IDBPDatabase<FourCornersMediaDB>> | null = null;
  private readonly DB_NAME = "four-corners-media";
  private readonly STORE_NAME = "blobs";
  private readonly DB_VERSION = 1;

  private getDB(): Promise<IDBPDatabase<FourCornersMediaDB>> {
    if (!this.dbPromise) {
      this.dbPromise = this.initDB();
    }
    return this.dbPromise;
  }

  private async initDB(): Promise<IDBPDatabase<FourCornersMediaDB>> {
    return openDB<FourCornersMediaDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("blobs")) {
          const store = db.createObjectStore("blobs", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("timestamp", "timestamp");
        }
      },
    });
  }

  async save(blob: Blob, filename: string): Promise<number> {
    const db = await this.getDB();
    const mediaBlob: MediaBlob = {
      blob,
      mimeType: blob.type,
      filename,
      timestamp: Date.now(),
    };
    return db.add(this.STORE_NAME, mediaBlob);
  }

  async get(id: number): Promise<MediaBlob | undefined> {
    const db = await this.getDB();
    return db.get(this.STORE_NAME, id);
  }

  async getMultiple(ids: number[]): Promise<Map<number, MediaBlob>> {
    const db = await this.getDB();
    const result = new Map<number, MediaBlob>();
    for (const id of ids) {
      const blob = await db.get(this.STORE_NAME, id);
      if (blob) result.set(id, blob);
    }
    return result;
  }

  async delete(id: number): Promise<void> {
    const db = await this.getDB();
    await db.delete(this.STORE_NAME, id);
  }

  async getAll(): Promise<MediaBlob[]> {
    const db = await this.getDB();
    return db.getAll(this.STORE_NAME);
  }

  async getAllKeys(): Promise<number[]> {
    const db = await this.getDB();
    return db.getAllKeys(this.STORE_NAME);
  }

  async cleanup(validIds: number[]): Promise<number> {
    const db = await this.getDB();
    const allKeys = await db.getAllKeys(this.STORE_NAME);
    const validIdSet = new Set(validIds);

    let deletedCount = 0;
    for (const key of allKeys) {
      if (!validIdSet.has(key)) {
        await db.delete(this.STORE_NAME, key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async getStorageEstimate(): Promise<{
    usage: number;
    quota: number;
    percentage: number;
  }> {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;

      return { usage, quota, percentage };
    }

    return { usage: 0, quota: 0, percentage: 0 };
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    await db.clear(this.STORE_NAME);
  }
}

export const mediaStorage = new MediaStorage();
