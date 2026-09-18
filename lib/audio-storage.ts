/**
 * Audio Storage - SSR-Safe Wrapper
 * Lazily imports browser-only IndexedDB implementation
 *
 * @author TheTechMargin
 */

export interface StoredRecording {
  id: string;
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  timestamp: string;
  duration: number;
}

export async function saveRecording(recording: StoredRecording): Promise<void> {
  if (typeof window === "undefined") return;

  const { saveRecording: browserSave } = await import(
    "./audio-storage-browser"
  );
  return browserSave(recording);
}

export async function loadRecordings(): Promise<StoredRecording[]> {
  if (typeof window === "undefined") return [];

  const { loadRecordings: browserLoad } = await import(
    "./audio-storage-browser"
  );
  return browserLoad();
}

export async function deleteRecording(id: string): Promise<void> {
  if (typeof window === "undefined") return;

  const { deleteRecording: browserDelete } = await import(
    "./audio-storage-browser"
  );
  return browserDelete(id);
}

export async function clearAllRecordings(): Promise<void> {
  if (typeof window === "undefined") return;

  const { clearAllRecordings: browserClear } = await import(
    "./audio-storage-browser"
  );
  return browserClear();
}

export function checkStorageSupport() {
  const support = {
    indexedDB: false,
    localStorage: false,
    mediaRecorder: false,
    getUserMedia: false,
  };

  // SSR guard - return all false during server-side rendering
  if (typeof window === "undefined") {
    return support;
  }

  try {
    support.indexedDB = !!window.indexedDB;
  } catch (e) {
    // IndexedDB not supported
  }

  try {
    support.localStorage = !!window.localStorage;
    localStorage.setItem("test", "test");
    localStorage.removeItem("test");
  } catch (e) {
    // localStorage not supported or blocked
  }

  support.mediaRecorder = !!window.MediaRecorder;
  support.getUserMedia = !!(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );

  return support;
}
