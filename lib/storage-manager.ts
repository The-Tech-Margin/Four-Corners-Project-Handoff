/**
 * Storage Manager - Single Source of Truth for Data Persistence
 *
 * HIERARCHY:
 * - Logged IN:  storage (cloud) is source of truth
 * - Logged OUT: IndexedDB/localStorage (local) is source of truth
 *
 * @author TheTechMargin
 */

const PRE_AUTH_WORK_KEY = "pre-auth-work-state";

/**
 * Save current work state before clearing for sign-in
 * Allows preserving work started before authentication
 */
export function savePreAuthWork(): void {
  try {
    if (typeof window === "undefined") return;

    const currentState = localStorage.getItem("four-corners-storage");
    if (currentState) {
      // Parse and check if there's actual work to preserve
      const parsed = JSON.parse(currentState);
      const hasWork =
        parsed.state?.backStory?.text ||
        parsed.state?.context?.length > 0 ||
        parsed.state?.links?.length > 0 ||
        parsed.state?.creativeCommons?.copyright ||
        parsed.state?.creativeCommons?.description ||
        parsed.state?.photographerInfo?.bio ||
        parsed.state?.photographerInfo?.contact ||
        parsed.state?.photographerInfo?.website ||
        parsed.state?.location ||
        parsed.state?.photoMetadata ||
        parsed.state?.voiceTranscriptions?.length > 0;

      if (hasWork) {
        sessionStorage.setItem(PRE_AUTH_WORK_KEY, currentState);
        console.log("[storage-manager] Pre-auth work saved");
      }
    }
  } catch (error) {
    console.error("Error saving pre-auth work:", error);
  }
}

/**
 * Restore work that was started before authentication
 */
export function restorePreAuthWork(): Record<string, unknown> | null {
  try {
    if (typeof window === "undefined") return null;

    const savedWork = sessionStorage.getItem(PRE_AUTH_WORK_KEY);
    if (savedWork) {
      sessionStorage.removeItem(PRE_AUTH_WORK_KEY);
      console.log("[storage-manager] Pre-auth work restored");
      return JSON.parse(savedWork);
    }
    return null;
  } catch (error) {
    console.error("Error restoring pre-auth work:", error);
    return null;
  }
}

/**
 * Clear all local storage when user signs in
 * Prevents stale local data from conflicting with storage data
 */
export async function clearLocalStorageOnSignIn(): Promise<void> {
  try {
    // Clear Zustand persisted state
    if (typeof window !== "undefined") {
      localStorage.removeItem("four-corners-storage");
    }

    // Clear IndexedDB databases
    if (typeof window !== "undefined" && window.indexedDB) {
      // Clear media storage
      await deleteDatabase("media-storage");

      // Clear audio storage
      await deleteDatabase("audio-storage");
    }
  } catch (error) {
    console.error("Error clearing local storage:", error);
  }
}

/**
 * Helper to delete an IndexedDB database
 */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn(
        `Database ${name} deletion blocked - may have open connections`,
      );
      resolve(); // Don't fail if blocked
    };
  });
}

/**
 * Check if user should use cloud storage (logged in) or local storage (logged out)
 */
export function shouldUseCloudStorage(isLoggedIn: boolean): boolean {
  return isLoggedIn;
}

/**
 * Get storage mode for current session
 */
export function getStorageMode(isLoggedIn: boolean): "cloud" | "local" {
  return isLoggedIn ? "cloud" : "local";
}
