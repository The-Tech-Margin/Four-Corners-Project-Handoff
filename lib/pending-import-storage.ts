/**
 * Pending Import Storage - IndexedDB storage for shared file import data
 *
 * Uses IndexedDB instead of localStorage to handle large metadata payloads
 * that include base64 images without hitting quota limits.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { FourCornersMetadataExtended } from "@/lib/schema";

interface PendingImport {
  id: string;
  slug: string;
  encodedId?: string;
  metadata?: FourCornersMetadataExtended;
  mainImageUrl?: string;
  timestamp: number;
}

interface PendingImportDB extends DBSchema {
  imports: {
    key: string;
    value: PendingImport;
  };
}

const DB_NAME = "four-corners-pending-import";
const STORE_NAME = "imports";
const DB_VERSION = 1;
const PENDING_IMPORT_KEY = "pending-shared-import";

// Singleton database promise
let dbPromise: Promise<IDBPDatabase<PendingImportDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PendingImportDB>> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB not available"));
  }

  if (!dbPromise) {
    dbPromise = openDB<PendingImportDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Store pending shared import data in IndexedDB
 * This allows storing full metadata including base64 images without quota issues
 */
export async function savePendingImport(data: {
  slug: string;
  encodedId?: string;
  metadata?: FourCornersMetadataExtended;
  mainImageUrl?: string;
}): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, {
      id: PENDING_IMPORT_KEY,
      slug: data.slug,
      encodedId: data.encodedId,
      metadata: data.metadata,
      mainImageUrl: data.mainImageUrl,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[pending-import] Failed to save to IndexedDB:", error);
    throw error;
  }
}

/**
 * Retrieve pending shared import data from IndexedDB
 * Returns null if not found or expired (>5 minutes old)
 */
export async function getPendingImport(): Promise<PendingImport | null> {
  try {
    const db = await getDB();
    const data = await db.get(STORE_NAME, PENDING_IMPORT_KEY);

    if (!data) {
      return null;
    }

    // Check if import intent is still fresh (within 5 minutes)
    const EXPIRY_MS = 5 * 60 * 1000;
    if (Date.now() - data.timestamp > EXPIRY_MS) {
      await clearPendingImport();
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Clear pending shared import data from IndexedDB
 */
export async function clearPendingImport(): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, PENDING_IMPORT_KEY);
  } catch {
    // Silently fail - clearing is best-effort
  }
}

/**
 * Check if there's a pending import without retrieving full data
 */
export async function hasPendingImport(): Promise<boolean> {
  try {
    const db = await getDB();
    const data = await db.get(STORE_NAME, PENDING_IMPORT_KEY);

    if (!data) return false;

    // Check expiry
    const EXPIRY_MS = 5 * 60 * 1000;
    if (Date.now() - data.timestamp > EXPIRY_MS) {
      await clearPendingImport();
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
