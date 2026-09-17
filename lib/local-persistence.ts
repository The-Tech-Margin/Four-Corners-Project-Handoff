/**
 * Local Persistence - IndexedDB storage for large data that exceeds localStorage limits
 *
 * Persists imageSrc (base64 data URLs) and consentDocuments (PDF data URLs)
 * to IndexedDB, which has generous quota (~50%+ of disk) vs localStorage's ~5MB.
 *
 * Follows the same class pattern as media-storage.ts.
 */

import { openDB, DBSchema, IDBPDatabase } from "idb";

interface StateEntry {
  key: string;
  value: unknown;
  timestamp: number;
}

interface FourCornersLocalDB extends DBSchema {
  state: {
    key: string;
    value: StateEntry;
  };
}

class LocalPersistence {
  private dbPromise: Promise<IDBPDatabase<FourCornersLocalDB>> | null = null;
  private db: IDBPDatabase<FourCornersLocalDB> | null = null;
  private readonly DB_NAME = "four-corners-local";
  private readonly STORE_NAME = "state";
  private readonly DB_VERSION = 1;

  private async getDB(): Promise<IDBPDatabase<FourCornersLocalDB>> {
    if (typeof window === "undefined") {
      throw new Error("IndexedDB is not available in SSR");
    }

    // Check if existing connection is still valid
    if (this.db) {
      try {
        if (this.db.objectStoreNames.contains(this.STORE_NAME)) {
          return this.db;
        }
      } catch {
        this.db = null;
        this.dbPromise = null;
      }
    }

    if (!this.dbPromise) {
      this.dbPromise = this.initDB();
    }

    try {
      this.db = await this.dbPromise;
      return this.db;
    } catch (error) {
      this.dbPromise = null;
      this.db = null;
      throw error;
    }
  }

  private async initDB(): Promise<IDBPDatabase<FourCornersLocalDB>> {
    return openDB<FourCornersLocalDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("state")) {
          db.createObjectStore("state", { keyPath: "key" });
        }
      },
    });
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    try {
      const db = await this.getDB();
      const entry = await db.get(this.STORE_NAME, key);
      return entry?.value as T | undefined;
    } catch (error) {
      // Retry once on stale connection
      if (
        error instanceof Error &&
        (error.message.includes("closing") ||
          error.name === "InvalidStateError")
      ) {
        this.db = null;
        this.dbPromise = null;
        const db = await this.getDB();
        const entry = await db.get(this.STORE_NAME, key);
        return entry?.value as T | undefined;
      }
      console.warn(`[LocalPersistence] Failed to get "${key}":`, error);
      return undefined;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      const db = await this.getDB();
      await db.put(this.STORE_NAME, {
        key,
        value,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn(`[LocalPersistence] Failed to set "${key}":`, error);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      await db.delete(this.STORE_NAME, key);
    } catch (error) {
      console.warn(`[LocalPersistence] Failed to remove "${key}":`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      await db.clear(this.STORE_NAME);
    } catch (error) {
      console.warn("[LocalPersistence] Failed to clear:", error);
    }
  }
}

export const localPersistence = new LocalPersistence();
