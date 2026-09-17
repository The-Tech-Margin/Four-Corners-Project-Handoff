/**
 * Saving a project.
 *
 * Pending media is uploaded first (each file to /api/storage/upload), then
 * the whole metadata document goes to the project API in one write. The
 * browser never writes to a database or an object store itself.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useAccess } from "@/components/access-provider";
import { ApiError } from "@/lib/api-client/http";
import {
  uploadContextAudio,
  uploadContextImages,
  uploadMainImage,
  uploadVoiceRecordings,
  type AudioUploadResult,
  type ContextUploadResult,
  type VoiceUploadResult,
} from "@/lib/api-client/media-upload";
import * as projectsApi from "@/lib/api-client/projects";
import { notifyFile } from "@/lib/notify";
import type { MainImageRef, ProjectRecord } from "@/lib/projects/types";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { useFourCornersStore } from "@/lib/store";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface SaveResult {
  success: boolean;
  error?: string;
  requiresAuth?: boolean;
  requiresSlug?: boolean;
}

/**
 * Every file that was meant to reach storage but didn't. The metadata still
 * saves, so the rest of the edit is not lost — but the person has to know
 * which files to retry rather than seeing "saved" over broken references.
 */
function collectUploadFailures(args: {
  context: FourCornersMetadataExtended["context"];
  contextResults: Map<string, ContextUploadResult>;
  contextAudioResults: Map<string, AudioUploadResult>;
  voice: FourCornersMetadataExtended["voiceTranscriptions"];
  voiceResults: Map<string, VoiceUploadResult>;
  freshMainImageAttempted: boolean;
  mainImageUploaded: boolean;
}): string[] {
  const failures: string[] = [];

  for (const item of args.context || []) {
    if (item.sourceType !== "upload") continue;
    if (item.storage_path) continue; // already stored
    if (!item.filename) continue; // nothing to upload
    const result = args.contextResults.get(item.id);
    if (!result || !result.success) failures.push(item.filename);
  }

  for (const item of args.context || []) {
    if (item.audioStoragePath) continue;
    const hasLocalAudio = !!item.audioDataUrl || typeof item.audioBlobId === "number";
    if (!hasLocalAudio) continue;
    const result = args.contextAudioResults.get(item.id);
    if (!result || !result.success) {
      failures.push(`context audio (${item.filename || item.id.slice(0, 8)})`);
    }
  }

  for (const voice of args.voice || []) {
    if (voice.audioStoragePath) continue;
    const hasLocalAudio = !!voice.audioDataUrl || typeof voice.audioBlobId === "number";
    if (!hasLocalAudio) continue;
    const result = args.voiceResults.get(voice.id);
    if (!result || !result.success) failures.push(`voice note (${voice.id.slice(0, 8)})`);
  }

  if (args.freshMainImageAttempted && !args.mainImageUploaded) failures.push("main image");

  return failures;
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export function useProjectSave() {
  const { user } = useAccess();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const projectId = useFourCornersStore((state) => state.projectId);
  const setProjectId = useFourCornersStore((state) => state.setProjectId);
  const setIsSaving = useFourCornersStore((state) => state.setIsSaving);
  const markSaved = useFourCornersStore((state) => state.markSaved);
  const imageSrc = useFourCornersStore((state) => state.imageSrc);
  const mainImageStoragePath = useFourCornersStore((state) => state.mainImageStoragePath);
  const importMetadata = useFourCornersStore((state) => state.importMetadata);
  const setVoiceTranscriptions = useFourCornersStore((state) => state.setVoiceTranscriptions);

  const checkAuth = async (): Promise<string | null> => user?.id ?? null;

  /** Upload everything still held locally, and fold the results into the document. */
  async function uploadPendingMedia(targetProjectId: string, metadata: FourCornersMetadataExtended) {
    const contextResults = await uploadContextImages(metadata.context || [], targetProjectId);

    const withImages = (metadata.context || []).map((item) => {
      const result = contextResults.get(item.id);
      if (!result?.success) return item;
      return {
        ...item,
        storage_path: result.path,
        storage_url: result.url,
        thumbnail_storage_path: result.thumbnail_path,
        thumbnail_storage_url: result.thumbnail_url,
      };
    });

    const contextAudioResults = await uploadContextAudio(withImages, targetProjectId);

    const context = withImages.map((item) => {
      const result = contextAudioResults.get(item.id);
      if (!result?.success) return item;
      // The bytes are stored now, so the local carriers go: the blob they
      // pointed at has already been freed.
      const { audioDataUrl: _audioDataUrl, audioBlobId: _audioBlobId, ...rest } = item;
      void _audioDataUrl;
      void _audioBlobId;
      return {
        ...rest,
        audioStoragePath: result.audioStoragePath || item.audioStoragePath,
        audioStorageUrl: result.audioStorageUrl || item.audioStorageUrl,
      };
    });

    const voiceResults = await uploadVoiceRecordings(
      metadata.voiceTranscriptions || [],
      targetProjectId,
    );

    const voiceTranscriptions = (metadata.voiceTranscriptions || []).map((voice) => {
      const result = voiceResults.get(voice.id);
      if (!result?.success) return voice;
      const { audioDataUrl: _audioDataUrl, audioBlobId: _audioBlobId, ...rest } = voice;
      void _audioDataUrl;
      void _audioBlobId;
      return {
        ...rest,
        audioStoragePath: result.storagePath || voice.audioStoragePath,
        audioStorageUrl: result.storageUrl || voice.audioStorageUrl,
      };
    });

    const freshMainImageAttempted = !!imageSrc?.startsWith("data:");
    const mainImageResult = freshMainImageAttempted
      ? await uploadMainImage(imageSrc as string, targetProjectId)
      : null;

    // A fresh upload wins; a library pick keeps its stored key; anything
    // else leaves the current value alone.
    const mainImage: MainImageRef | undefined = mainImageResult
      ? { kind: "blob", key: mainImageResult.path, thumbnailKey: mainImageResult.thumbnailPath }
      : mainImageStoragePath
        ? undefined
        : imageSrc
          ? undefined
          : null;

    const merged: FourCornersMetadataExtended = { ...metadata, context, voiceTranscriptions };

    return {
      metadata: merged,
      mainImage,
      failures: collectUploadFailures({
        context,
        contextResults,
        contextAudioResults,
        voice: voiceTranscriptions,
        voiceResults,
        freshMainImageAttempted,
        mainImageUploaded: !!mainImageResult,
      }),
      uploadedAnyAudio: contextAudioResults.size > 0,
      context,
      voiceTranscriptions,
    };
  }

  /** Reflect what the server stored: hydrated URLs, storage paths, slug. */
  function adoptSavedProject(project: ProjectRecord, options: { replaceMetadata?: boolean } = {}) {
    if (options.replaceMetadata) importMetadata(project.metadata);
    useFourCornersStore.setState({
      mainImageStoragePath: project.main_image_storage_path ?? null,
      ...(project.main_image_url ? { imageSrc: project.main_image_url } : {}),
    });
  }

  const saveExisting = async (
    metadata: FourCornersMetadataExtended,
    _userId?: string,
  ): Promise<SaveResult> => {
    void _userId;
    if (!projectId) {
      return { success: false, error: "No project ID", requiresSlug: true };
    }

    setSaving(true);
    setIsSaving(true);
    setSaveStatus("saving");

    try {
      const uploaded = await uploadPendingMedia(projectId, metadata);

      const { project } = await projectsApi.save(projectId, {
        metadata: uploaded.metadata,
        mainImage: uploaded.mainImage,
      });

      if (uploaded.voiceTranscriptions.length > 0) {
        setVoiceTranscriptions(project.metadata.voiceTranscriptions ?? uploaded.voiceTranscriptions);
      }
      if (uploaded.uploadedAnyAudio) {
        useFourCornersStore.setState({
          context: project.metadata.context ?? uploaded.context,
        });
      }
      adoptSavedProject(project);
      markSaved();

      if (uploaded.failures.length > 0) {
        notifyFile.uploadsIncomplete(uploaded.failures);
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
        return {
          success: false,
          error: `${uploaded.failures.length} file(s) didn't upload`,
        };
      }

      setSaveStatus("saved");
      toast.success("File saved successfully!", { icon: "💾" });
      setTimeout(() => setSaveStatus("idle"), 2000);
      return { success: true };
    } catch (error) {
      console.error("Save failed:", error);
      setSaveStatus("error");
      const message = describeError(error);
      toast.error(`Failed to save: ${message}`, { icon: "❌" });
      setTimeout(() => setSaveStatus("idle"), 3000);
      return { success: false, error: message };
    } finally {
      setSaving(false);
      setIsSaving(false);
    }
  };

  const createNew = async (
    metadata: FourCornersMetadataExtended,
    _userId: string | undefined,
    slug: string,
    title?: string,
  ): Promise<SaveResult> => {
    void _userId;
    if (!slug.trim()) return { success: false, error: "Slug required" };

    setSaving(true);
    setIsSaving(true);
    setSaveStatus("saving");

    try {
      // Create first: uploads need the project id in their storage keys.
      const created = await projectsApi.create({
        metadata,
        slug,
        title: title ?? null,
        mainImage: mainImageStoragePath
          ? { kind: "blob", key: mainImageStoragePath, thumbnailKey: null }
          : null,
      });

      const newId = created.project.id;
      setProjectId(newId, created.project.slug || slug, title || undefined);

      const uploaded = await uploadPendingMedia(newId, metadata);
      const { project } = await projectsApi.save(newId, {
        metadata: uploaded.metadata,
        mainImage: uploaded.mainImage,
      });

      adoptSavedProject(project, { replaceMetadata: true });
      markSaved();

      if (uploaded.failures.length > 0) {
        notifyFile.uploadsIncomplete(uploaded.failures);
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
        return {
          success: false,
          error: `${uploaded.failures.length} file(s) didn't upload`,
        };
      }

      setSaveStatus("saved");
      toast.success("File created successfully!", { icon: "✨" });
      setTimeout(() => setSaveStatus("idle"), 2000);
      return { success: true };
    } catch (error) {
      console.error("Create failed:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);

      if (error instanceof ApiError && error.code === "SLUG_TAKEN") {
        const message = `Project name "${slug}" already exists. Please choose a different name.`;
        toast.error(message, { icon: "⚠️" });
        return { success: false, error: message };
      }

      const message = describeError(error);
      toast.error(`Failed to create: ${message}`, { icon: "❌" });
      return { success: false, error: message };
    } finally {
      setSaving(false);
      setIsSaving(false);
    }
  };

  const save = async (metadata: FourCornersMetadataExtended): Promise<SaveResult> => {
    if (!user) return { success: false, requiresAuth: true };
    if (!projectId) return { success: false, requiresSlug: true };
    return saveExisting(metadata);
  };

  return { saving, saveStatus, save, saveExisting, createNew, checkAuth };
}
