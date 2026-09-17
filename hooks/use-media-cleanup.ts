import { useEffect } from "react";
import { useFourCornersStore } from "@/lib/store";
import { mediaStorage } from "@/lib/media-storage";

/**
 * Periodically delete media blobs in IndexedDB that no longer have a
 * reference in the Zustand store.
 *
 * Two prior bugs caused user data to disappear silently:
 *
 *   1. Hydration race. Zustand persist is async-backed (IndexedDB), so on
 *      page load the store mounts with the INITIAL (empty) state, then
 *      hydrates asynchronously. If cleanup ran on mount before hydration
 *      finished, the keep-set was [] and every blob got deleted —
 *      including images/videos/audio attached in a prior session that
 *      hadn't yet uploaded to Supabase. Symptom: user re-opens the editor
 *      and an attached video has no playable file even though the
 *      metadata still claims it.
 *
 *   2. audioBlobId was added to VoiceTranscription in commit a963ce7 but
 *      this hook only tracked context[].blobId. Every cleanup tick wiped
 *      voice audio blobs the store legitimately referenced.
 *
 * Fix: defer the first run until persist.onFinishHydration fires, and
 * include audioBlobId references in the keep-set.
 */
export function useMediaCleanup() {
  useEffect(() => {
    let cancelled = false;

    const cleanupOrphanedBlobs = async () => {
      if (cancelled) return;
      try {
        const { context, voiceTranscriptions } = useFourCornersStore.getState();

        const referenced = new Set<number>();
        for (const item of context) {
          if (item.sourceType === "upload" && item.blobId !== undefined) {
            referenced.add(item.blobId);
          }
        }
        for (const t of voiceTranscriptions) {
          if (t.audioBlobId !== undefined) {
            referenced.add(t.audioBlobId);
          }
        }

        await mediaStorage.cleanup(Array.from(referenced));
      } catch (error) {
        console.error("Failed to cleanup orphaned blobs:", error);
      }
    };

    // Wait for persist hydration before the first run. The persist API
    // exposes `hasHydrated()` for the synchronous check and
    // `onFinishHydration` for the late-arrival case.
    const persist = useFourCornersStore.persist;
    const unsubHydrate = persist.onFinishHydration(() => {
      cleanupOrphanedBlobs();
    });
    if (persist.hasHydrated()) {
      cleanupOrphanedBlobs();
    }

    const interval = setInterval(cleanupOrphanedBlobs, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      unsubHydrate();
      clearInterval(interval);
    };
  }, []);
}
