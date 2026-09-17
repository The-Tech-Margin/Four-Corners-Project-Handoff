"use client";

import { useEffect, useRef } from "react";
import { useFourCornersStore } from "@/lib/store";
import { localPersistence } from "@/lib/local-persistence";
import { debounce } from "@/lib/debounce";

const WRITE_DEBOUNCE_MS = 300;

/**
 * Persists imageSrc and consentDocuments to IndexedDB for logged-out users.
 *
 * - On mount: rehydrates store from IndexedDB (only fills empty/null values)
 * - On change: syncs store values back to IndexedDB (debounced)
 * - Skipped entirely when SSR or when viewing a shared project
 */
export function useLocalPersistence() {
  const hydratedRef = useRef(false);

  // Rehydrate from IndexedDB on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const rehydrate = async () => {
      try {
        // Skip rehydration if a cloud file is being actively loaded via URL
        const params = new URLSearchParams(window.location.search);
        if (params.get("file") || params.get("project")) {
          return;
        }

        const state = useFourCornersStore.getState();

        const [savedImageSrc, savedConsentDocs] = await Promise.all([
          localPersistence.get<string>("imageSrc"),
          localPersistence.get<Array<{ name: string; size: number; type: string; dataUrl: string; uploadedAt: string }>>("consentDocuments"),
        ]);

        const updates: Record<string, unknown> = {};

        // Always restore imageSrc if the in-memory value is empty.
        // imageSrc is excluded from Zustand's localStorage persistence
        // (too large), so it's always null after a page reload or tab
        // resume — even when projectId is set (cloud project loaded).
        if (savedImageSrc && !state.imageSrc) {
          updates.imageSrc = savedImageSrc;
        }

        // Only restore consentDocuments for local (non-cloud) projects
        if (
          !state.projectId &&
          savedConsentDocs &&
          savedConsentDocs.length > 0 &&
          state.consentDocuments.length === 0
        ) {
          updates.consentDocuments = savedConsentDocs;
        }

        if (Object.keys(updates).length > 0) {
          useFourCornersStore.setState(updates);
        }
      } catch (error) {
        console.warn("[useLocalPersistence] Rehydration failed:", error);
      }
    };

    rehydrate();
  }, []);

  // Subscribe to store changes and write to IndexedDB
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Debounced writer to avoid thrashing on rapid changes
    const writeImageSrc = debounce(async (value: string | null) => {
      if (value) {
        await localPersistence.set("imageSrc", value);
      } else {
        await localPersistence.remove("imageSrc");
      }
    }, WRITE_DEBOUNCE_MS);

    const writeConsentDocs = debounce(async (docs: Array<{ name: string; size: number; type: string; dataUrl: string; uploadedAt: string }>) => {
      if (docs.length > 0) {
        await localPersistence.set("consentDocuments", docs);
      } else {
        await localPersistence.remove("consentDocuments");
      }
    }, WRITE_DEBOUNCE_MS);

    const unsubscribe = useFourCornersStore.subscribe((state, prevState) => {
      // Write imageSrc when it changes
      if (state.imageSrc !== prevState.imageSrc) {
        writeImageSrc(state.imageSrc);
      }

      // Write consentDocuments when they change
      if (state.consentDocuments !== prevState.consentDocuments) {
        writeConsentDocs(state.consentDocuments);
      }
    });

    // Flush pending debounced writes AND perform an immediate synchronous
    // write of the current imageSrc value. The debounce flush only fires
    // if there's a pending timer; this ensures the value is persisted even
    // when the last change already triggered the debounced write but the
    // async IndexedDB operation hasn't completed yet.
    const flushAll = () => {
      writeImageSrc.flush();
      writeConsentDocs.flush();

      // Immediate non-debounced write — belt-and-suspenders to guarantee
      // the latest imageSrc reaches IndexedDB before the browser can
      // freeze or discard the tab.
      const current = useFourCornersStore.getState();
      if (current.imageSrc) {
        // Fire-and-forget write — races against browser freeze
        localPersistence.set("imageSrc", current.imageSrc).catch(() => {});
      }

      // Also persist consent documents
      if (current.consentDocuments.length > 0) {
        localPersistence.set("consentDocuments", current.consentDocuments).catch(() => {});
      }
    };

    // When the tab becomes visible again, Zustand will have rehydrated
    // metadata from localStorage but imageSrc is excluded (too large).
    // If the browser discarded our in-memory state while suspended,
    // imageSrc will be null even though it's safely in IndexedDB.
    const restoreOnResume = async () => {
      // Small delay to let Zustand localStorage rehydration finish first
      await new Promise((r) => setTimeout(r, 50));

      const state = useFourCornersStore.getState();
      if (state.imageSrc) return; // still in memory — nothing to do

      // Try IndexedDB first
      const saved = await localPersistence.get<string>("imageSrc");
      if (saved) {
        useFourCornersStore.setState({ imageSrc: saved });
        return;
      }

      // Fallback: if user has a cloud project loaded, re-fetch from DB
      if (state.projectId) {
        try {
          const { getProject } = await import("@/lib/api-client/project-actions");
          const project = await getProject(state.projectId);
          if (project?.main_image_url) {
            useFourCornersStore.setState({
              imageSrc: project.main_image_url,
              // Mirror the DB's storage path into the store so a follow-up
              // save preserves the gallery's ability to reconstruct URLs.
              mainImageStoragePath: project.main_image_storage_path ?? null,
            });
            // Also persist to IndexedDB for future tab switches
            localPersistence.set("imageSrc", project.main_image_url).catch(() => {});
          }
        } catch (err) {
          console.warn("[useLocalPersistence] Failed to refetch image from DB:", err);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        flushAll();
      } else {
        // Tab just became visible — restore imageSrc if lost
        restoreOnResume();
      }
    };

    // Some browsers don't always fire visibilitychange reliably;
    // use focus as a backup trigger to restore the image.
    const handleFocus = () => {
      const state = useFourCornersStore.getState();
      if (!state.imageSrc) {
        restoreOnResume();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", flushAll);
    window.addEventListener("beforeunload", flushAll);
    window.addEventListener("pagehide", flushAll);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", flushAll);
      window.removeEventListener("beforeunload", flushAll);
      window.removeEventListener("pagehide", flushAll);
      unsubscribe();
      writeImageSrc.cancel();
      writeConsentDocs.cancel();
    };
  }, []);
}
