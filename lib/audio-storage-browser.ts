"use client";

/**
 * Audio Storage - Browser Implementation
 * IndexedDB-based storage for audio recordings
 *
 * @author TheTechMargin
 */

import type { DBSchema, IDBPDatabase } from "idb";

interface AudioDB extends DBSchema {
  recordings: {
    key: string;
    value: {
      id: string;
      blob: Blob;
      mimeType: string;
      timestamp: string;
      duration: number;
    };
  };
}

export interface StoredRecording {
  id: string;
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  timestamp: string;
  duration: number;
}

let dbPromise: Promise<IDBPDatabase<AudioDB>> | null = null;

async function getDB() {
  if (!dbPromise) {
    const { openDB } = await import("idb");
    dbPromise = openDB<AudioDB>("four-corners-audio", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("recordings")) {
          db.createObjectStore("recordings", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function saveRecording(recording: StoredRecording): Promise<void> {
  try {
    const db = await getDB();
    await db.put("recordings", {
      id: recording.id,
      blob: recording.blob,
      mimeType: recording.mimeType,
      timestamp: recording.timestamp,
      duration: recording.duration,
    });
  } catch (error) {
    console.error("IndexedDB save failed:", error);
    // Fallback to localStorage
    try {
      const stored = localStorage.getItem("voice-recordings") || "[]";
      const existing = JSON.parse(stored);
      existing.push({
        id: recording.id,
        dataUrl: recording.dataUrl,
        mimeType: recording.mimeType,
        timestamp: recording.timestamp,
        duration: recording.duration,
      });
      localStorage.setItem("voice-recordings", JSON.stringify(existing));
    } catch (storageError) {
      if (
        storageError instanceof DOMException &&
        storageError.name === "QuotaExceededError"
      ) {
        throw new Error(
          "Storage quota exceeded. Please delete old recordings to free up space."
        );
      }
      throw storageError;
    }
  }
}

export async function loadRecordings(): Promise<StoredRecording[]> {
  try {
    const db = await getDB();
    const records = await db.getAll("recordings");

    return Promise.all(
      records.map(async (record) => {
        const dataUrl = await blobToDataURL(record.blob);
        return {
          id: record.id,
          blob: record.blob,
          dataUrl,
          mimeType: record.mimeType,
          timestamp: record.timestamp,
          duration: record.duration,
        };
      })
    );
  } catch (error) {
    console.error("IndexedDB load failed, trying localStorage:", error);
    const stored = localStorage.getItem("voice-recordings");
    if (!stored) return [];

    try {
      const existing = JSON.parse(stored);
      return existing.map((r: { id: string; dataUrl: string; mimeType?: string; timestamp: string; duration: number }) => ({
        id: r.id,
        blob: new Blob(),
        dataUrl: r.dataUrl,
        mimeType: r.mimeType || "audio/webm",
        timestamp: r.timestamp,
        duration: r.duration,
      }));
    } catch (parseError) {
      console.error("Failed to parse localStorage:", parseError);
      return [];
    }
  }
}

export async function deleteRecording(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete("recordings", id);
  } catch (error) {
    console.error("IndexedDB delete failed:", error);
  }

  try {
    const stored = localStorage.getItem("voice-recordings");
    if (stored) {
      const existing = JSON.parse(stored);
      const updated = existing.filter((r: { id: string }) => r.id !== id);
      localStorage.setItem("voice-recordings", JSON.stringify(updated));
    }
  } catch (error) {
    console.error("localStorage delete failed:", error);
  }
}

export async function clearAllRecordings(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear("recordings");
  } catch (error) {
    console.error("IndexedDB clear failed:", error);
  }

  try {
    localStorage.removeItem("voice-recordings");
  } catch (error) {
    console.error("localStorage clear failed:", error);
  }
}
