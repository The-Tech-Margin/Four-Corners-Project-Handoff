"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useFourCornersStore } from "@/lib/store";
import { useProjectMetadata } from "./useProjectMetadata";
import { useProjectSave } from "./useProjectSave";
import { debounce } from "@/lib/debounce";

export type AutosaveStatus = "idle" | "waiting" | "saving" | "saved" | "error";

// Reduced delay for more responsive autosave - saves 2 seconds after last change
const AUTOSAVE_DELAY_MS = 2000;
const SAVED_DISPLAY_MS = 1500;

interface UseAutosaveOptions {
  enabled?: boolean;
}

export function useAutosave(options: UseAutosaveOptions = {}) {
  const { enabled = true } = options;

  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [lastAutosaveError, setLastAutosaveError] = useState<string | null>(
    null,
  );

  const { buildMetadata } = useProjectMetadata();
  const { saveExisting, createNew, checkAuth } = useProjectSave();
  // Watch the *global* save lock from the store, not this hook's own
  // useProjectSave instance — the SaveButton has a separate instance whose
  // local `saving` state is invisible here. The store-backed flag is the only
  // way the autosave can know about a manual createNew already in flight.
  const globalIsSaving = useFourCornersStore((s) => s.isSaving);

  const isSavingRef = useRef(false);
  const isEnabledRef = useRef(enabled);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isEnabledRef.current = enabled;
  }, [enabled]);

  const performAutosave = useCallback(async () => {
    const state = useFourCornersStore.getState();

    if (!isEnabledRef.current) return;
    if (!state.hasUnsavedChanges && state.projectId) return;
    if (isSavingRef.current) return;
    // `state.isSaving` is the global lock set by useProjectSave's
    // createNew/saveExisting. Without this check, a manual createNew triggered
    // from the SaveButton (which has its *own* useProjectSave instance) can
    // race with the autosave timer — both call createProject with the same
    // slug, the second hits the unique constraint, and the user sees a
    // confusing "duplicate file" toast even though they only saved once.
    if (state.isSaving) return;

    // Need either an existing project or a pending slug + content to auto-create.
    // Content = a main image OR a voice note (audio-first drafts have no image).
    const canSaveExisting = !!state.projectId;
    const hasPrimaryContent =
      !!state.imageSrc || state.voiceTranscriptions.length > 0;
    const canAutoCreate =
      !state.projectId && !!state.pendingSlug?.trim() && hasPrimaryContent;

    if (!canSaveExisting && !canAutoCreate) return;

    const userId = await checkAuth();
    if (!userId) return;

    isSavingRef.current = true;
    setAutosaveStatus("saving");
    setLastAutosaveError(null);

    try {
      const metadata = buildMetadata();
      let result;

      if (canAutoCreate && state.pendingSlug) {
        // Auto-create the project with the pending slug
        result = await createNew(metadata, userId, state.pendingSlug.trim());
      } else {
        // Save existing project
        result = await saveExisting(metadata, userId);
      }

      if (result.success) {
        setAutosaveStatus("saved");
        savedTimerRef.current = setTimeout(() => {
          setAutosaveStatus("idle");
        }, SAVED_DISPLAY_MS);
      } else {
        setAutosaveStatus("error");
        setLastAutosaveError(result.error || "Autosave failed");
        savedTimerRef.current = setTimeout(() => {
          setAutosaveStatus("idle");
        }, 5000);
      }
    } catch (err) {
      console.error("[Autosave] Failed:", err);
      setAutosaveStatus("error");
      setLastAutosaveError(err instanceof Error ? err.message : "Autosave failed");
      savedTimerRef.current = setTimeout(() => {
        setAutosaveStatus("idle");
      }, 5000);
    } finally {
      isSavingRef.current = false;
    }
  }, [buildMetadata, saveExisting, createNew, checkAuth]);

  // Debounced save
  const debouncedSaveRef = useRef(
    debounce(performAutosave, AUTOSAVE_DELAY_MS),
  );

  useEffect(() => {
    debouncedSaveRef.current = debounce(performAutosave, AUTOSAVE_DELAY_MS);
    return () => {
      debouncedSaveRef.current.cancel();
    };
  }, [performAutosave]);

  // Subscribe to store changes
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = useFourCornersStore.subscribe((state, prevState) => {
      // Trigger for existing projects: content changed
      const existingProjectChanged =
        state.hasUnsavedChanges &&
        state.projectId &&
        (state.hasUnsavedChanges !== prevState.hasUnsavedChanges ||
          state.meta?.updatedAt !== prevState.meta?.updatedAt);

      // Trigger for new projects: has pendingSlug + primary content (image or
      // voice note) + content changes
      const newProjectReady =
        !state.projectId &&
        state.pendingSlug?.trim() &&
        (state.imageSrc || state.voiceTranscriptions.length > 0) &&
        state.hasUnsavedChanges &&
        (state.meta?.updatedAt !== prevState.meta?.updatedAt ||
          state.pendingSlug !== prevState.pendingSlug ||
          state.hasUnsavedChanges !== prevState.hasUnsavedChanges);

      if (existingProjectChanged || newProjectReady) {
        setAutosaveStatus("waiting");
        debouncedSaveRef.current();
      }
    });

    return () => {
      unsubscribe();
      debouncedSaveRef.current.cancel();
    };
  }, [enabled]);

  // Cancel any pending debounced autosave the moment a manual save starts.
  // Driven by the store's global isSaving flag so this also covers the
  // SaveButton's separate useProjectSave instance.
  useEffect(() => {
    if (globalIsSaving) {
      debouncedSaveRef.current.cancel();
      setAutosaveStatus("idle");
    }
  }, [globalIsSaving]);

  // Flush on tab switch
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const state = useFourCornersStore.getState();
        const shouldFlush =
          (state.hasUnsavedChanges && state.projectId) ||
          (!state.projectId &&
            state.pendingSlug?.trim() &&
            (state.imageSrc || state.voiceTranscriptions.length > 0) &&
            state.hasUnsavedChanges);

        if (shouldFlush) {
          debouncedSaveRef.current.flush();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled]);

  // Cleanup
  useEffect(() => {
    return () => {
      debouncedSaveRef.current.cancel();
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const cancelPendingAutosave = useCallback(() => {
    debouncedSaveRef.current.cancel();
    if (autosaveStatus === "waiting") {
      setAutosaveStatus("idle");
    }
  }, [autosaveStatus]);

  return {
    autosaveStatus,
    lastAutosaveError,
    cancelPendingAutosave,
  };
}
