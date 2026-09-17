/**
 * Eager (save-on-attach) audio upload.
 *
 * Audio clips used to sit in the store as base64 `audioDataUrl` until the
 * Save button uploaded them all in one batch — which failed when several
 * clips were pending at once. This hook uploads each clip to storage
 * Storage the moment it's attached (record / upload / transcribe), patches
 * the store entry with the storage path/URL, and kicks off a background
 * save so the row persists without the user pressing Save.
 *
 * If the user is logged out or the project hasn't been created yet, it does
 * nothing — the deferred upload in useProjectSave still covers that path.
 */

import { useCallback } from "react";
import { useFourCornersStore } from "@/lib/store";
import { useProjectSave } from "@/hooks/useProjectSave";
import { uploadVoiceRecording } from "@/lib/api-client/media-upload";
import { useAccess } from "@/components/access-provider";
import { mediaStorage } from "@/lib/media-storage";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { notify } from "@/lib/notify";

/** Build the full metadata object from the live store (mirror of useProjectMetadata). */
function metadataFromStore(): FourCornersMetadataExtended {
  const s = useFourCornersStore.getState();
  return {
    backStory: s.backStory,
    context: s.context,
    links: s.links,
    creativeCommons: s.creativeCommons,
    ethics: s.ethics,
    photographerInfo: s.photographerInfo,
    location: s.location,
    photoMetadata: s.photoMetadata,
    voiceTranscriptions: s.voiceTranscriptions,
    meta: s.meta,
  } as FourCornersMetadataExtended;
}

export function useEagerAudioUpload() {
  const { save } = useProjectSave();
  const { user } = useAccess();

  /**
   * Upload one transcription's audio immediately and persist in the
   * background. Safe to fire-and-forget; failures leave audioDataUrl in
   * place so the regular Save retries the upload.
   */
  const eagerUploadTranscription = useCallback(
    async (transcriptionId: string): Promise<void> => {
      const store = useFourCornersStore.getState();
      const { projectId } = store;
      if (!projectId) return; // unsaved project — deferred path covers it

      if (!user) return; // logged out — deferred path covers it

      const vt = useFourCornersStore
        .getState()
        .voiceTranscriptions.find((t) => t.id === transcriptionId);
      if (!vt) return;

      // Library picks (and anything already uploaded) skip straight to the
      // background save.
      if (!vt.audioStorageUrl) {
        const hasLocalAudio =
          !!vt.audioDataUrl || typeof vt.audioBlobId === "number";
        if (!hasLocalAudio) return;

        const result = await uploadVoiceRecording(vt, projectId);
        if (!result.success) {
          // Keep audioDataUrl/audioBlobId so the Save button retries.
          notify.error("Audio upload failed — it will retry when you save");
          return;
        }

        // The audio is stored now: free the IDB blob and drop the in-memory
        // data URL, mirroring useProjectSave's post-upload patch.
        if (typeof vt.audioBlobId === "number") {
          try {
            await mediaStorage.delete(vt.audioBlobId);
          } catch (e) {
            console.warn("[EagerAudioUpload] mediaStorage.delete failed:", e);
          }
        }
        useFourCornersStore.getState().setVoiceTranscriptions(
          useFourCornersStore.getState().voiceTranscriptions.map((t) => {
            if (t.id !== transcriptionId) return t;
            const {
              audioDataUrl: _audioDataUrl,
              audioBlobId: _audioBlobId,
              ...rest
            } = t;
            void _audioDataUrl;
            void _audioBlobId;
            return {
              ...rest,
              audioStoragePath: result.storagePath || t.audioStoragePath,
              audioStorageUrl: result.storageUrl || t.audioStorageUrl,
            };
          }),
        );
      }

      // Persist the transcription row in the background so a refresh can't
      // lose it. Skip when another save is already running — that save (or
      // the user's eventual manual save) writes the same rows.
      if (useFourCornersStore.getState().isSaving) return;
      try {
        await save(metadataFromStore());
      } catch (e) {
        // Non-fatal: audio is in storage; the next manual save writes the row.
        console.warn("[EagerAudioUpload] background save failed:", e);
      }
    },
    [save],
  );

  return { eagerUploadTranscription };
}
