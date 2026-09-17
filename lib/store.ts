/**
 * Four Corners Global State Store
 * Zustand store for managing Four Corners metadata
 *
 * DATA HIERARCHY (Single Source of Truth):
 * - SIGNED IN:  the server is the source of truth
 * - SIGNED OUT: localStorage (via Zustand persist) is the source of truth
 * - RUNTIME:    Zustand state, in memory, always used during a session
 *
 * FLOW:
 * 1. On sign-in: clear local storage, reset state, load from the server
 * 2. On sign-out: save locally so the work continues offline
 * 3. Signed in: every save goes to the server
 * 4. Signed out: saves go to localStorage + IndexedDB (media)
 *
 * @author TheTechMargin
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FourCornersMetadataExtended } from "./schema";
import { CURRENT_EXPORT_VERSION } from "./export-contract";
import { localPersistence } from "./local-persistence";

interface ConsentDocument {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  uploadedAt: string;
}

interface VoiceTranscription {
  id: string;
  recordingId: string;
  text: string;
  transcribedAt: string;
  fieldId?: string;
  audioDataUrl?: string;
  audioStoragePath?: string;
  audioStorageUrl?: string;
  /**
   * Numeric ID into the mediaStorage IDB (lib/media-storage.ts) where the
   * raw audio Blob lives until the upload succeeds. Survives
   * mobile tab-discard / refresh: when the page reloads with a transcription
   * that has audioBlobId but no audioStorageUrl, the upload helper recovers
   * the Blob from mediaStorage and uploads it. Cleared after upload.
   */
  audioBlobId?: number;
  mimeType?: string;
  duration?: number;
}

interface FourCornersState extends FourCornersMetadataExtended {
  imageSrc: string | null;
  /**
   * Storage path for the main image when it points at a storage object
   * (library pick or previously-uploaded asset). Kept in sync with imageSrc
   * so the save flow can write both `main_image_url` AND
   * `main_image_storage_path` — the display layer reconstructs URLs from the
   * storage path, so omitting it breaks gallery/dashboard rendering.
   */
  mainImageStoragePath: string | null;
  mode: "minimal" | "standard" | "complete";
  layoutMode: string;
  /** Transient: which corner/section the user is currently viewing (scroll-spy).
   *  Not persisted — used for issue-report diagnostics. */
  focusedCorner: string | null;
  focusedSection: string | null;
  selectedCorners: {
    backstory: boolean;
    relatedImagery: boolean;
    links: boolean;
  };
  excludeLocationFromExport: boolean;
  includeExifInExport: boolean;
  consentDocuments: ConsentDocument[];
  voiceTranscriptions: VoiceTranscription[];

  // Project persistence
  projectId: string | null;
  projectSlug: string | null;
  projectTitle: string | null;
  pendingSlug: string | null;
  pendingTitle: string | null;
  lastSavedAt: string | null;
  hasUnsavedChanges: boolean;
  /** Global save lock — true while any createNew/saveExisting is in flight.
   *  Lives in the store (not local hook state) because the SaveButton and the
   *  autosave hook are *separate* useProjectSave instances; without a shared
   *  flag the autosave timer can fire mid-create and run a duplicate INSERT
   *  with the same slug, hitting Postgres 23505 and producing a misleading
   *  "duplicate file" toast. */
  isSaving: boolean;

  setImageSrc: (src: string | null) => void;
  /** Set the main image from a library asset — tracks both URL and path. */
  setMainImageFromStorage: (src: string, storagePath: string) => void;
  setMode: (mode: "minimal" | "standard" | "complete") => void;
  setLayoutMode: (layoutMode: string) => void;
  setFocusedField: (corner: string | null, section?: string | null) => void;
  toggleCornerSelection: (
    corner: "backstory" | "relatedImagery" | "links"
  ) => void;
  updateBackStory: (field: string, value: string) => void;
  updateCreativeCommons: (field: string, value: string) => void;
  updateEthics: (field: string, value: boolean | string) => void;
  updatePhotographerInfo: (field: string, value: string) => void;
  updateLocation: (location: FourCornersMetadataExtended["location"]) => void;
  toggleExcludeLocation: () => void;
  toggleIncludeExif: () => void;
  updatePhotoMetadata: (
    photoMetadata: FourCornersMetadataExtended["photoMetadata"]
  ) => void;
  addLink: (link: { title: string; url: string; source: string }) => void;
  removeLink: (index: number) => void;
  addContext: (item: {
    src: string;
    caption: string;
    type: "image" | "video";
  }) => void;
  addUploadedContext: (item: FourCornersMetadataExtended["context"][0]) => void;
  updateContext: (
    index: number,
    updates: Partial<FourCornersMetadataExtended["context"][0]>
  ) => void;
  removeContext: (index: number) => Promise<void>;
  reorderContext: (fromIndex: number, toIndex: number) => void;
  addConsentDocument: (doc: ConsentDocument) => void;
  removeConsentDocument: (index: number) => void;
  addVoiceTranscription: (transcription: VoiceTranscription) => void;
  removeVoiceTranscription: (id: string) => void;
  setVoiceTranscriptions: (transcriptions: VoiceTranscription[]) => void;
  importMetadata: (metadata: FourCornersMetadataExtended) => void;
  reset: () => void;

  // Project persistence actions
  setProjectId: (id: string, slug: string, title?: string) => void;
  setPendingSlug: (slug: string | null) => void;
  setPendingTitle: (title: string | null) => void;
  markSaved: () => void;
  markUnsaved: () => void;
  clearProject: () => void;
  setIsSaving: (value: boolean) => void;
}

const initialState: Omit<
  FourCornersState,
  | "setImageSrc"
  | "setMainImageFromStorage"
  | "setMode"
  | "setLayoutMode"
  | "setFocusedField"
  | "toggleCornerSelection"
  | "updateBackStory"
  | "updateCreativeCommons"
  | "updateEthics"
  | "updatePhotographerInfo"
  | "updateLocation"
  | "toggleExcludeLocation"
  | "toggleIncludeExif"
  | "updatePhotoMetadata"
  | "addLink"
  | "removeLink"
  | "addContext"
  | "addUploadedContext"
  | "updateContext"
  | "removeContext"
  | "reorderContext"
  | "addConsentDocument"
  | "removeConsentDocument"
  | "addVoiceTranscription"
  | "removeVoiceTranscription"
  | "setVoiceTranscriptions"
  | "importMetadata"
  | "reset"
  | "setProjectId"
  | "setPendingSlug"
  | "setPendingTitle"
  | "markSaved"
  | "markUnsaved"
  | "setIsSaving"
  | "clearProject"
> = {
  imageSrc: null,
  mainImageStoragePath: null,
  mode: "complete",
  layoutMode: "scroll",
  focusedCorner: null,
  focusedSection: null,
  selectedCorners: {
    backstory: true,
    relatedImagery: false,
    links: false,
  },
  excludeLocationFromExport: false,
  includeExifInExport: true,
  consentDocuments: [],
  voiceTranscriptions: [],
  projectId: null,
  projectSlug: null,
  projectTitle: null,
  pendingSlug: null,
  pendingTitle: null,
  lastSavedAt: null,
  hasUnsavedChanges: false,
  isSaving: false,
  backStory: {
    text: "",
    author: "",
    publication: "",
    publicationUrl: "",
    date: new Date().toISOString().split("T")[0],
  },
  context: [],
  links: [],
  creativeCommons: {
    copyright: "",
    description: "",
  },
  ethics: {
    noManipulation: false,
    noStaging: false,
    informedConsent: false,
    identityProtected: false,
    aiAltered: false,
  },
  photographerInfo: undefined,
  location: undefined,
  photoMetadata: undefined,
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editorVersion: CURRENT_EXPORT_VERSION,
    mode: "complete",
  },
};

export const useFourCornersStore = create<FourCornersState>()(
  persist(
    (set, get) => ({
      ...initialState,
      // Mark dirty when the user replaces or clears the main image.
      // Project load paths in useLocalPersistence write imageSrc via setState
      // directly so they don't trip this flag; createNew calls setImageSrc
      // then markSaved() immediately after, which resets this to false.
      // Clear mainImageStoragePath — a bare URL has no associated storage
      // path, so any stale value would point at the previous image.
      setImageSrc: (src) =>
        set({
          imageSrc: src,
          mainImageStoragePath: null,
          hasUnsavedChanges: true,
        }),
      setMainImageFromStorage: (src, storagePath) =>
        set({
          imageSrc: src,
          mainImageStoragePath: storagePath,
          hasUnsavedChanges: true,
        }),
      toggleCornerSelection: (corner) =>
        set((state) => {
          const currentSelections = state.selectedCorners;
          const selectedCount =
            Object.values(currentSelections).filter(Boolean).length;
          const isCurrentlySelected = currentSelections[corner];

          // If trying to deselect and only 1 corner is selected, don't allow
          if (isCurrentlySelected && selectedCount === 1) {
            return state;
          }

          // If trying to select and already have 2 selected, don't allow
          if (!isCurrentlySelected && selectedCount === 2) {
            return state;
          }

          return {
            selectedCorners: {
              ...currentSelections,
              [corner]: !isCurrentlySelected,
            },
          };
        }),
      setLayoutMode: (layoutMode) => set({ layoutMode }),
      setFocusedField: (corner, section = null) =>
        set({ focusedCorner: corner, focusedSection: section }),
      setMode: (mode) =>
        set((state) => ({
          mode,
          meta: {
            createdAt: state.meta?.createdAt || initialState.meta!.createdAt,
            editorVersion:
              state.meta?.editorVersion || initialState.meta!.editorVersion,
            mode,
            updatedAt: new Date().toISOString(),
          },
        })),
      updateBackStory: (field, value) =>
        set((state) => ({
          backStory: { ...state.backStory, [field]: value },
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      updateCreativeCommons: (field, value) =>
        set((state) => ({
          creativeCommons: { ...state.creativeCommons, [field]: value },
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      updateEthics: (field, value) =>
        set((state) => ({
          ethics: {
            ...state.ethics!,
            [field]: value,
          },
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      updatePhotographerInfo: (field, value) =>
        set((state) => ({
          photographerInfo: {
            ...state.photographerInfo,
            [field]: value,
          },
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      updateLocation: (location) =>
        set((state) => ({
          location,
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      toggleExcludeLocation: () =>
        set((state) => ({
          excludeLocationFromExport: !state.excludeLocationFromExport,
        })),
      toggleIncludeExif: () =>
        set((state) => ({
          includeExifInExport: !state.includeExifInExport,
        })),
      updatePhotoMetadata: (photoMetadata) =>
        set((state) => ({
          photoMetadata,
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      addLink: (link) =>
        set((state) => ({
          links: [...state.links, link],
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      removeLink: (index) =>
        set((state) => ({
          links: state.links.filter((_, i) => i !== index),
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      addContext: (item) =>
        set((state) => ({
          context: [
            ...state.context,
            {
              id: crypto.randomUUID(),
              sourceType: "url" as const,
              url: item.src,
              src: item.src,
              caption: item.caption,
              type: item.type,
            },
          ],
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      addUploadedContext: (item) =>
        set((state) => ({
          context: [...state.context, item],
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      updateContext: (index, updates) =>
        set((state) => ({
          context: state.context.map((item, i) =>
            i === index ? { ...item, ...updates } : item
          ),
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      removeContext: async (index) => {
        const item = get().context[index];

        // If it's an uploaded item, clean up IndexedDB
        if (item?.sourceType === "upload" && item.blobId !== undefined) {
          const { mediaStorage } = await import("./media-storage");
          try {
            await mediaStorage.delete(item.blobId);
          } catch (error) {
            console.error("Failed to delete blob from IndexedDB:", error);
          }
        }

        set((state) => ({
          context: state.context.filter((_, i) => i !== index),
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        }));
      },
      reorderContext: (fromIndex, toIndex) =>
        set((state) => {
          const len = state.context.length;
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= len ||
            toIndex >= len
          ) {
            return {};
          }
          const next = [...state.context];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return {
            context: next,
            meta: { ...state.meta!, updatedAt: new Date().toISOString() },
            hasUnsavedChanges: true,
          };
        }),
      addConsentDocument: (doc) =>
        set((state) => ({
          consentDocuments: [...state.consentDocuments, doc],
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
        })),
      removeConsentDocument: (index) =>
        set((state) => ({
          consentDocuments: state.consentDocuments.filter(
            (_, i) => i !== index
          ),
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
        })),
      addVoiceTranscription: (transcription) =>
        set((state) => ({
          voiceTranscriptions: [...state.voiceTranscriptions, transcription],
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      removeVoiceTranscription: (id) =>
        set((state) => ({
          voiceTranscriptions: state.voiceTranscriptions.filter(
            (t) => t.id !== id
          ),
          meta: { ...state.meta!, updatedAt: new Date().toISOString() },
          hasUnsavedChanges: true,
        })),
      setVoiceTranscriptions: (transcriptions) =>
        set(() => ({
          voiceTranscriptions: transcriptions,
          // Don't mark as unsaved since this is typically used for URL refresh
        })),
      importMetadata: (metadata) =>
        set((state) => {
          // Extract mode from metadata
          const importedMode = metadata.meta?.mode || initialState.meta!.mode;

          // Derive selectedCorners from mode for shared files
          const derivedCorners = {
            backstory: importedMode === "minimal" ? true : true,
            relatedImagery: importedMode === "complete",
            links: importedMode === "standard" || importedMode === "complete",
          };

          // Merge nested objects with defaults to ensure all fields exist
          const mergedBackStory = {
            ...initialState.backStory,
            ...(metadata.backStory || {}),
          };

          const mergedCreativeCommons = {
            ...initialState.creativeCommons,
            ...(metadata.creativeCommons || {}),
          };

          const srcEthics = metadata.ethics;
          const defEthics = initialState.ethics!;
          const mergedEthics = {
            noManipulation: srcEthics?.noManipulation ?? defEthics.noManipulation,
            noStaging: srcEthics?.noStaging ?? defEthics.noStaging,
            informedConsent: srcEthics?.informedConsent ?? defEthics.informedConsent,
            identityProtected: srcEthics?.identityProtected ?? defEthics.identityProtected,
            aiAltered: srcEthics?.aiAltered ?? defEthics.aiAltered ?? false,
            ...(srcEthics?.customEthicsText !== undefined && { customEthicsText: srcEthics.customEthicsText }),
            ...(srcEthics?.manipulationDetails !== undefined && { manipulationDetails: srcEthics.manipulationDetails }),
            ...(srcEthics?.stagingDetails !== undefined && { stagingDetails: srcEthics.stagingDetails }),
            ...(srcEthics?.consentDetails !== undefined && { consentDetails: srcEthics.consentDetails }),
            ...(srcEthics?.identityProtectionDetails !== undefined && { identityProtectionDetails: srcEthics.identityProtectionDetails }),
            ...(srcEthics?.consentDocumentUrl !== undefined && { consentDocumentUrl: srcEthics.consentDocumentUrl }),
            ...(srcEthics?.aiAlteredDetails !== undefined && { aiAlteredDetails: srcEthics.aiAlteredDetails }),
          };

          return {
            backStory: mergedBackStory,
            context: metadata.context || initialState.context,
            links: metadata.links || initialState.links,
            creativeCommons: mergedCreativeCommons,
            ethics: mergedEthics,
            photographerInfo: metadata.photographerInfo ?? initialState.photographerInfo,
            location: metadata.location ?? initialState.location,
            photoMetadata: metadata.photoMetadata ?? initialState.photoMetadata,
            voiceTranscriptions:
              metadata.voiceTranscriptions || initialState.voiceTranscriptions,

            mode: importedMode,
            selectedCorners: derivedCorners,

            meta: {
              createdAt:
                metadata.meta?.createdAt ||
                state.meta?.createdAt ||
                initialState.meta!.createdAt,
              editorVersion:
                metadata.meta?.editorVersion ||
                state.meta?.editorVersion ||
                initialState.meta!.editorVersion,
              mode: importedMode,
              updatedAt: new Date().toISOString(),
            },
          };
        }),
      reset: () => set(initialState),

      // Project persistence actions
      setProjectId: (id, slug, title) =>
        set({
          projectId: id,
          projectSlug: slug,
          projectTitle: title || null,
          pendingSlug: null,
          pendingTitle: null,
          hasUnsavedChanges: false,
        }),
      markSaved: () =>
        set({
          lastSavedAt: new Date().toISOString(),
          hasUnsavedChanges: false,
        }),
      markUnsaved: () => set({ hasUnsavedChanges: true }),
      clearProject: () =>
        set({
          projectId: null,
          projectSlug: null,
          projectTitle: null,
          pendingSlug: null,
          pendingTitle: null,
          lastSavedAt: null,
          hasUnsavedChanges: false,
        }),
      setPendingTitle: (title) => set({ pendingTitle: title }),
      setPendingSlug: (slug) => set({ pendingSlug: slug }),
      setIsSaving: (value) => set({ isSaving: value }),
    }),
    {
      name: "four-corners-storage",
      // Backed by IndexedDB (via localPersistence). localStorage capped at
      // ~5MB and a single project with voice recordings could exceed it;
      // IDB has ~50%+ of disk available.
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? {
              getItem: async (name: string) =>
                (await localPersistence.get<string>(name)) ?? null,
              setItem: async (name: string, value: string) => {
                await localPersistence.set(name, value);
              },
              removeItem: async (name: string) => {
                await localPersistence.remove(name);
              },
            }
          : {
              getItem: async () => null,
              setItem: async () => {},
              removeItem: async () => {},
            }
      ),
      partialize: (state) => ({
        mode: state.mode,
        // layoutMode intentionally excluded — driven by URL param or in-app selector, not sticky across sessions
        selectedCorners: state.selectedCorners,
        excludeLocationFromExport: state.excludeLocationFromExport,
        includeExifInExport: state.includeExifInExport,
        backStory: state.backStory,
        // Strip base64 data URLs from context items — the *_storage_url
        // fields are the source of truth for media that has been uploaded
        // to storage. data: URLs only exist for unsaved local edits and
        // the active session keeps them in memory anyway.
        context: state.context.map((item) => {
          const copy = { ...item };
          delete copy.thumbnailDataUrl;
          delete copy.audioDataUrl;
          if (copy.src && copy.src.startsWith("data:")) delete copy.src;
          return copy;
        }),
        links: state.links,
        creativeCommons: state.creativeCommons,
        ethics: state.ethics,
        photographerInfo: state.photographerInfo,
        location: state.location,
        photoMetadata: state.photoMetadata,
        // Same treatment for voice transcriptions: keep audioStorageUrl,
        // drop the base64 audioDataUrl which can be megabytes per clip.
        voiceTranscriptions: state.voiceTranscriptions.map((t) => {
          const copy = { ...t };
          delete copy.audioDataUrl;
          return copy;
        }),
        meta: state.meta,
        pendingSlug: state.pendingSlug,
        pendingTitle: state.pendingTitle,
        // Persist project identity so save works after page refresh/navigation
        projectId: state.projectId,
        projectSlug: state.projectSlug,
        projectTitle: state.projectTitle,
        // imageSrc and consentDocuments are persisted separately by
        // localPersistence (lib/local-persistence.ts) — same IDB store,
        // different keys.
      }),
    }
  )
);
