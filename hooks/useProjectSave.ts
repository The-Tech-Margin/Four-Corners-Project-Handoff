import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createProject, updateProject } from "@/lib/db/projects";
import { useFourCornersStore } from "@/lib/store";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import toast from "react-hot-toast";
import { uploadContextImages, uploadContextAudio, uploadMainImageToStorage } from "@/lib/supabase-context-storage";
import { uploadVoiceRecordings } from "@/lib/supabase-voice-storage";
import { notifyFile } from "@/lib/notify";

/**
 * Walk the upload result maps and collect every item that was expected to
 * land in storage but didn't. Returns user-facing labels so we can surface
 * the failure clearly instead of silently saving metadata-only.
 *
 * Without this audit, these failure paths show "File saved successfully":
 *   1. uploadContext* returns success:false (network, codec, RLS, etc.)
 *   2. uploadContextImages skips an item because blobId is missing
 *      (IndexedDB was wiped between attach and save)
 *   3. uploadMainImageToStorage returns null for a fresh data-URL main image
 *   4. uploadContextAudio fails or finds no local audio for an item
 */
function collectUploadFailures(args: {
  context: FourCornersMetadataExtended["context"];
  contextResults: Map<string, { success: boolean; error?: string }>;
  contextAudioResults: Map<string, { success: boolean; error?: string }>;
  voice: FourCornersMetadataExtended["voiceTranscriptions"];
  voiceResults: Map<string, { success: boolean; error?: string }>;
  freshMainImageAttempted: boolean;
  mainImageResult: { path: string } | null;
}): string[] {
  const failures: string[] = [];

  for (const item of args.context || []) {
    if (item.sourceType !== "upload") continue;
    if (item.storage_url) continue; // already uploaded
    if (!item.filename) continue;   // nothing to upload
    const r = args.contextResults.get(item.id);
    if (!r) {
      failures.push(item.filename); // skipped — blobId missing
    } else if (!r.success) {
      failures.push(item.filename);
    }
  }

  for (const item of args.context || []) {
    if (item.audioStorageUrl) continue; // already uploaded
    const hasLocalAudio =
      !!item.audioDataUrl || typeof item.audioBlobId === "number";
    if (!hasLocalAudio) continue;
    const r = args.contextAudioResults.get(item.id);
    if (!r || !r.success) {
      failures.push(`context audio (${item.filename || item.id.slice(0, 8)})`);
    }
  }

  for (const vt of args.voice || []) {
    if (vt.audioStorageUrl) continue;
    if (!vt.audioDataUrl) continue;
    const r = args.voiceResults.get(vt.id);
    const label = `voice note (${vt.id.slice(0, 8)})`;
    if (!r) {
      failures.push(label);
    } else if (!r.success) {
      failures.push(label);
    }
  }

  if (args.freshMainImageAttempted && !args.mainImageResult) {
    failures.push("main image");
  }

  return failures;
}
import { upsertBackstory } from "@/lib/db/backstory";
import { upsertCreativeCommons } from "@/lib/db/creative-commons";
import { upsertPhotographerInfo } from "@/lib/db/photographer-info";
import { upsertEthics } from "@/lib/db/ethics";
import { upsertLocation } from "@/lib/db/locations";
import { upsertPhotoMetadata } from "@/lib/db/photo-metadata";
import { syncContextItems } from "@/lib/db/context-items";
import { deleteAllLinks, createLink } from "@/lib/db/links";
import { deleteAllVoiceTranscriptions, createVoiceTranscription } from "@/lib/db/voice-transcriptions";

/**
 * Pull a usable shape out of whatever Supabase / postgrest / fetch threw.
 *
 * Supabase's PostgrestError is a plain object whose fields are non-enumerable
 * (`message`, `code`, `details`, `hint`), so `console.error("…", err)` and
 * `JSON.stringify(err)` both bottom out as `{}`. The old catch blocks used
 * `err instanceof Error ? err.message : "Unknown error"` which falls into the
 * "Unknown error" branch for that exact case — masking the real failure.
 *
 * This helper returns a flat object suitable for logging *and* a useful
 * `.message` string for toasts/return values.
 */
function describeSaveError(err: unknown): {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
} {
  if (err instanceof Error) {
    const e = err as Error & { code?: string; details?: string; hint?: string; status?: number };
    return { message: e.message, code: e.code, details: e.details, hint: e.hint, status: e.status };
  }
  if (err && typeof err === "object") {
    const e = err as { message?: string; code?: string; details?: string; hint?: string; status?: number };
    return {
      message: e.message ?? "Unknown error",
      code: e.code,
      details: e.details,
      hint: e.hint,
      status: e.status,
    };
  }
  if (typeof err === "string") return { message: err };
  return { message: "Unknown error" };
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface SaveResult {
  success: boolean;
  error?: string;
  requiresAuth?: boolean;
  requiresSlug?: boolean;
}

/**
 * Upsert all normalized tables for a project.
 * Phase 5: This is the ONLY write path — no more JSONB blob writes.
 */
async function syncNormalizedTables(
  projectId: string,
  metadata: FourCornersMetadataExtended,
) {
  // Upsert 1:1 tables in parallel
  await Promise.all([
    upsertBackstory(projectId, metadata.backStory),
    upsertCreativeCommons(projectId, metadata.creativeCommons),
    upsertPhotographerInfo(projectId, metadata.photographerInfo),
    upsertEthics(projectId, metadata.ethics),
    upsertLocation(projectId, metadata.location),
    upsertPhotoMetadata(projectId, metadata.photoMetadata),
  ]);

  // Sync context items (upsert existing, insert new, delete removed)
  await syncContextItems(projectId, metadata.context || []);

  // Replace links
  await deleteAllLinks(projectId);
  if (metadata.links && metadata.links.length > 0) {
    for (let i = 0; i < metadata.links.length; i++) {
      await createLink(projectId, metadata.links[i], i);
    }
  }

  // Replace voice transcriptions
  await deleteAllVoiceTranscriptions(projectId);
  if (metadata.voiceTranscriptions && metadata.voiceTranscriptions.length > 0) {
    for (let i = 0; i < metadata.voiceTranscriptions.length; i++) {
      await createVoiceTranscription(projectId, metadata.voiceTranscriptions[i], i);
    }
  }
}

export function useProjectSave() {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const projectId = useFourCornersStore((state) => state.projectId);
  const setProjectId = useFourCornersStore((state) => state.setProjectId);
  const setIsSaving = useFourCornersStore((state) => state.setIsSaving);
  const markSaved = useFourCornersStore((state) => state.markSaved);
  const imageSrc = useFourCornersStore((state) => state.imageSrc);
  const mainImageStoragePath = useFourCornersStore(
    (state) => state.mainImageStoragePath,
  );
  const importMetadata = useFourCornersStore((state) => state.importMetadata);
  const setVoiceTranscriptions = useFourCornersStore((state) => state.setVoiceTranscriptions);

  const checkAuth = async (): Promise<string | null> => {
    if (!supabase) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id || null;
  };

  const saveExisting = async (
    metadata: FourCornersMetadataExtended,
    userId: string
  ): Promise<SaveResult> => {
    if (!projectId) {
      return { success: false, error: "No project ID", requiresSlug: true };
    }

    setSaving(true);
    setIsSaving(true);
    setSaveStatus("saving");

    try {
      // Upload context images to Supabase Storage
      const contextUploadResults = await uploadContextImages(
        metadata.context || [],
        userId,
        projectId
      );

      // Update metadata with storage URLs (both full-size and thumbnails)
      const imageMergedContext = (metadata.context || []).map((item) => {
        const uploadResult = contextUploadResults.get(item.id);
        if (uploadResult?.success) {
          return {
            ...item,
            storage_path: uploadResult.path,
            storage_url: uploadResult.url,
            thumbnail_storage_path: uploadResult.thumbnail_path,
            thumbnail_storage_url: uploadResult.thumbnail_url,
          };
        }
        return item;
      });

      // Upload context-item audio annotations to Supabase Storage
      const contextAudioResults = await uploadContextAudio(
        imageMergedContext,
        userId,
        projectId
      );

      const updatedContext = imageMergedContext.map((item) => {
        const uploadResult = contextAudioResults.get(item.id);
        if (uploadResult?.success) {
          // Drop audioDataUrl + audioBlobId — Supabase is now the source of
          // truth and uploadContextAudio has already freed the IDB blob.
          const { audioDataUrl: _audioDataUrl, audioBlobId: _audioBlobId, ...rest } = item;
          void _audioDataUrl;
          void _audioBlobId;
          return {
            ...rest,
            audioStoragePath: uploadResult.audioStoragePath || item.audioStoragePath,
            audioStorageUrl: uploadResult.audioStorageUrl || item.audioStorageUrl,
          };
        }
        return item;
      });

      // Upload voice recordings to Supabase Storage
      const voiceUploadResults = await uploadVoiceRecordings(
        metadata.voiceTranscriptions || [],
        userId,
        projectId
      );

      const updatedTranscriptions = (metadata.voiceTranscriptions || []).map((vt) => {
        const uploadResult = voiceUploadResults.get(vt.id);
        if (uploadResult?.success) {
          // Drop audioDataUrl + audioBlobId — Supabase is now the source of
          // truth for the audio. uploadVoiceRecordings has already deleted
          // the IDB blob; clearing the reference here keeps the persisted
          // state from pointing at a freed blob ID.
          const { audioDataUrl: _audioDataUrl, audioBlobId: _audioBlobId, ...rest } = vt;
          void _audioDataUrl;
          void _audioBlobId;
          return {
            ...rest,
            audioStoragePath: uploadResult.storagePath || vt.audioStoragePath,
            audioStorageUrl: uploadResult.storageUrl || vt.audioStorageUrl,
          };
        }
        return vt;
      });

      const updatedMetadata = {
        ...metadata,
        context: updatedContext,
        voiceTranscriptions: updatedTranscriptions,
      };

      // Upload main image to storage (no-op if already a URL or empty)
      const mainImageResult = imageSrc
        ? await uploadMainImageToStorage(imageSrc, userId, projectId)
        : null;

      // Prefer a freshly uploaded path (data-URL flow), fall back to the
      // library-pick path stored in Zustand. One of the two must accompany
      // main_image_url — the display layer reconstructs URLs from the path
      // and renders nothing when it's absent.
      const storagePath = mainImageResult?.path ?? mainImageStoragePath ?? undefined;

      // Pass undefined when no fresh thumb was generated so the existing
      // column value is preserved (e.g. user only edited metadata).
      const thumbnailPath = mainImageResult?.thumbnailPath !== undefined
        ? mainImageResult.thumbnailPath
        : undefined;

      await updateProject(
        projectId,
        updatedMetadata,
        userId,
        imageSrc || undefined,
        storagePath,
        thumbnailPath,
      );

      // Sync normalized tables
      await syncNormalizedTables(projectId, updatedMetadata);

      // Fire-and-forget: generate search embedding (non-blocking)
      fetch("/api/ai/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      }).catch(() => {}); // Silent — tsvector search still works

      // Update store with storage URLs and clear audioDataUrl to prevent re-upload
      if (updatedTranscriptions.length > 0) {
        setVoiceTranscriptions(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          updatedTranscriptions.map(({ audioDataUrl: _, ...rest }) => rest)
        );
      }

      // Same for context audio: the store's items must pick up the storage
      // URLs, or the next save would chase an already-freed IDB blob.
      if (contextAudioResults.size > 0) {
        useFourCornersStore.setState({ context: updatedContext });
      }

      markSaved();

      // Surface any uploads that didn't land. Metadata was still saved so
      // other edits don't disappear, but the user must know files are missing
      // so they can retry — otherwise the project ends up with broken refs.
      const uploadFailures = collectUploadFailures({
        context: updatedContext,
        contextResults: contextUploadResults,
        contextAudioResults,
        voice: updatedTranscriptions,
        voiceResults: voiceUploadResults,
        freshMainImageAttempted: !!(imageSrc && imageSrc.startsWith("data:")),
        mainImageResult,
      });

      if (uploadFailures.length > 0) {
        notifyFile.uploadsIncomplete(uploadFailures);
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
        return {
          success: false,
          error: `${uploadFailures.length} file(s) didn't upload`,
        };
      }

      setSaveStatus("saved");
      toast.success("File saved successfully!", {
        icon: "💾",
      });
      setTimeout(() => setSaveStatus("idle"), 2000);
      return { success: true };
    } catch (err) {
      console.error("Save failed:", describeSaveError(err));
      setSaveStatus("error");
      const errMsg = describeSaveError(err).message;
      toast.error(`Failed to save: ${errMsg}`, {
        icon: "❌",
      });
      setTimeout(() => setSaveStatus("idle"), 3000);
      return { success: false, error: errMsg };
    } finally {
      setSaving(false);
      setIsSaving(false);
    }
  };

  const createNew = async (
    metadata: FourCornersMetadataExtended,
    userId: string,
    slug: string,
    title?: string,
  ): Promise<SaveResult> => {
    if (!slug.trim()) {
      return { success: false, error: "Slug required" };
    }

    setSaving(true);
    setIsSaving(true);
    setSaveStatus("saving");

    try {
      // First create the project to get an ID. If the main image came from
      // the library we already have its storage path — persist it on create.
      const project = await createProject(
        metadata,
        userId,
        slug,
        imageSrc || undefined,
        mainImageStoragePath ?? undefined,
        undefined, // parentProjectId
        false,     // autoAddToGallery
        undefined, // tags
        title,
      );

      // Set project ID first
      setProjectId(project.id, project.slug || slug, title || undefined);

      // Upload main image to storage (no-op if already a URL or empty)
      const mainImageResult = imageSrc
        ? await uploadMainImageToStorage(imageSrc, userId, project.id)
        : null;

      // Upload context images to Supabase Storage
      const contextUploadResults = await uploadContextImages(
        metadata.context || [],
        userId,
        project.id
      );

      // Upload context-item audio annotations to Supabase Storage
      const contextAudioResults = await uploadContextAudio(
        metadata.context || [],
        userId,
        project.id
      );

      // Upload voice recordings to Supabase Storage
      const voiceUploadResults = await uploadVoiceRecordings(
        metadata.voiceTranscriptions || [],
        userId,
        project.id
      );

      // Update metadata with storage URLs if any uploads succeeded
      let finalMetadata = metadata;
      const hasContextUploads = contextUploadResults.size > 0;
      const hasContextAudioUploads = contextAudioResults.size > 0;
      const hasVoiceUploads = voiceUploadResults.size > 0;

      if (hasContextUploads || hasContextAudioUploads || hasVoiceUploads) {
        const updatedContext = (metadata.context || []).map((item) => {
          const uploadResult = contextUploadResults.get(item.id);
          const merged = uploadResult?.success
            ? {
                ...item,
                storage_path: uploadResult.path,
                storage_url: uploadResult.url,
                thumbnail_storage_path: uploadResult.thumbnail_path,
                thumbnail_storage_url: uploadResult.thumbnail_url,
              }
            : item;
          const audioResult = contextAudioResults.get(item.id);
          if (audioResult?.success) {
            // Drop audioDataUrl + audioBlobId — see twin block in
            // saveExisting for rationale.
            const { audioDataUrl: _audioDataUrl, audioBlobId: _audioBlobId, ...rest } = merged;
            void _audioDataUrl;
            void _audioBlobId;
            return {
              ...rest,
              audioStoragePath: audioResult.audioStoragePath || merged.audioStoragePath,
              audioStorageUrl: audioResult.audioStorageUrl || merged.audioStorageUrl,
            };
          }
          return merged;
        });

        const updatedTranscriptions = (metadata.voiceTranscriptions || []).map((vt) => {
          const uploadResult = voiceUploadResults.get(vt.id);
          if (uploadResult?.success) {
            // Drop audioDataUrl + audioBlobId — see twin block above for
            // rationale.
            const { audioDataUrl: _audioDataUrl, audioBlobId: _audioBlobId, ...rest } = vt;
            void _audioDataUrl;
            void _audioBlobId;
            return {
              ...rest,
              audioStoragePath: uploadResult.storagePath || vt.audioStoragePath,
              audioStorageUrl: uploadResult.storageUrl || vt.audioStorageUrl,
            };
          }
          return vt;
        });

        finalMetadata = {
          ...metadata,
          context: updatedContext,
          voiceTranscriptions: updatedTranscriptions,
        };
      }

      if (hasContextUploads || hasVoiceUploads || mainImageResult) {
        // Update with storage URLs and/or main image storage path.
        // Fall back to a library-provided storage path when no upload ran.
        await updateProject(
          project.id,
          finalMetadata,
          userId,
          imageSrc || undefined,
          mainImageResult?.path ?? mainImageStoragePath ?? undefined,
          mainImageResult?.thumbnailPath ?? undefined,
        );
      }

      // Sync normalized tables
      await syncNormalizedTables(project.id, finalMetadata);

      // Fire-and-forget: generate search embedding (non-blocking)
      fetch("/api/ai/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id }),
      }).catch(() => {}); // Silent — tsvector search still works

      // Import the saved metadata to ensure editor reflects canonical saved version
      importMetadata(project.metadata);

      // Load main image if available. Seed the storage path too so a
      // subsequent save preserves the gallery's URL reconstruction.
      if (project.main_image_url) {
        useFourCornersStore.setState({
          imageSrc: project.main_image_url,
          mainImageStoragePath: project.main_image_storage_path ?? null,
        });
      }

      // Mark as saved
      markSaved();

      // Audit upload results — same logic as saveExisting. The project row
      // exists in the DB, so we can't unwind the create, but we MUST surface
      // any upload misses so the user knows to save again to retry.
      const uploadFailures = collectUploadFailures({
        context: (finalMetadata as FourCornersMetadataExtended).context,
        contextResults: contextUploadResults,
        contextAudioResults,
        voice: (finalMetadata as FourCornersMetadataExtended).voiceTranscriptions,
        voiceResults: voiceUploadResults,
        freshMainImageAttempted: !!(imageSrc && imageSrc.startsWith("data:")),
        mainImageResult,
      });

      if (uploadFailures.length > 0) {
        notifyFile.uploadsIncomplete(uploadFailures);
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
        return {
          success: false,
          error: `${uploadFailures.length} file(s) didn't upload`,
        };
      }

      setSaveStatus("saved");
      toast.success("File created successfully!", {
        icon: "✨",
      });
      setTimeout(() => setSaveStatus("idle"), 2000);
      return { success: true };
    } catch (err) {
      const described = describeSaveError(err);
      console.error("Create failed:", described);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);

      // Check for duplicate slug error (PostgreSQL error code 23505)
      if (described.code === "23505" || described.message.includes("duplicate key")) {
        toast.error(
          `Project name "${slug}" already exists. Please choose a different name.`,
          {
            icon: "⚠️",
          }
        );
        return {
          success: false,
          error: `Project name "${slug}" already exists. Please choose a different name.`,
        };
      }

      toast.error(`Failed to create: ${described.message}`, {
        icon: "❌",
      });
      return {
        success: false,
        error: described.message,
      };
    } finally {
      setSaving(false);
      setIsSaving(false);
    }
  };

  const save = async (
    metadata: FourCornersMetadataExtended
  ): Promise<SaveResult> => {
    if (!supabase) {
      return {
        success: false,
        error:
          "Supabase is not configured. Please add your Supabase credentials to .env.local",
      };
    }

    const userId = await checkAuth();
    if (!userId) {
      return { success: false, requiresAuth: true };
    }

    if (!projectId) {
      return { success: false, requiresSlug: true };
    }

    return saveExisting(metadata, userId);
  };

  return {
    saving,
    saveStatus,
    save,
    saveExisting,
    createNew,
    checkAuth,
  };
}
