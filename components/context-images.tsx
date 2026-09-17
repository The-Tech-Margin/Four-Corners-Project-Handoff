"use client";

import { useState, useRef, useEffect, DragEvent } from "react";
import { useFourCornersStore } from "@/lib/store";
import { notifyFile, notifyAuth, notifyPublish, notifySave } from "@/lib/notify";
import { AddContextDialog } from "@/components/add-context-dialog";
import { AssetLibraryModal } from "@/components/asset-library-modal";
import { ContextImageViewer } from "@/components/context-image-viewer";
import { Library, Upload } from "lucide-react";
import { validateUpload, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/upload-limits";
import { checkQuotaForUpload } from "@/lib/api-client/quota";
import { SectionHeader } from "@/components/section-header";
import { mediaStorage } from "@/lib/media-storage";
import { generateThumbnail } from "@/lib/thumbnail";
import { maybeConvertHeic } from "@/lib/heic-to-jpeg";
import type { ContextItem, UserAsset } from "@/lib/field-registry";
import { createChildProject } from "@/lib/api-client/project-actions";
import { useAccess } from "@/components/access-provider";

interface ContextImagesProps {
  initiallyExpanded?: boolean;
}

// Custom drag type so thumbnail reorder drags are distinguishable from
// OS file drags (the section is also a file-drop upload zone).
const REORDER_MIME = "application/x-fc-context-reorder";

export function ContextImages({
  initiallyExpanded = false,
}: ContextImagesProps) {
  const { user } = useAccess();
  const store = useFourCornersStore();
  const {
    context,
    mode,
    selectedCorners,
    addContext,
    addUploadedContext,
    removeContext,
    updateContext,
    reorderContext,
    backStory,
    links,
    creativeCommons,
    ethics,
    photographerInfo,
    location,
    photoMetadata,
    meta,
    projectSlug,
  } = store;
  // Auto-expand when mode is "complete" or when context has data
  const shouldAutoExpand =
    initiallyExpanded || mode === "complete" || context.length > 0;
  const [isExpanded, setIsExpanded] = useState(shouldAutoExpand);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  // Thumbnail drag-to-reorder state (separate from the file-drop isDragging)
  const [reorderFrom, setReorderFrom] = useState<number | null>(null);
  const [reorderOver, setReorderOver] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-sync expansion state when conditions change
  useEffect(() => {
    const shouldExpand =
      initiallyExpanded || mode === "complete" || context.length > 0;
    if (shouldExpand && !isExpanded) {
      setIsExpanded(true);
    }
  }, [initiallyExpanded, mode, context.length]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        let file = files[i];

        // Validate file type - be permissive for mobile (HEIC, etc.)
        // Check both MIME type and file extension as fallback
        const isImage =
          file.type.startsWith("image/") ||
          /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
        const isVideo =
          file.type.startsWith("video/") ||
          /\.(mp4|webm|mov|m4v|avi|mkv|3gp|3g2|mpeg|mpg|ogv|wmv|flv|hevc|m2ts|ts)$/i.test(file.name);

        if (!isImage && !isVideo) {
          notifyFile.invalidType(file.name);
          continue;
        }

        // Pre-flight per-file size check — fires toast, skips this file,
        // keeps going with the rest of the batch (don't abort the loop).
        const kind = isVideo ? "video" : "image";
        const sizeCheck = validateUpload(file, kind);
        if (!sizeCheck.ok) {
          notifyFile.tooLarge(
            sizeCheck.fileName,
            sizeCheck.actualBytes,
            sizeCheck.limitBytes,
            sizeCheck.kind,
          );
          continue;
        }

        // Pre-flight quota check — same skip-on-fail semantics.
        if (user) {
          const quota = await checkQuotaForUpload(file.size);
          if (!quota.ok) {
            notifyFile.quotaExceeded(quota.used, quota.limit, quota.plan);
            continue;
          }
        }

        // Transparently convert HEIC/HEIF → JPEG so non-Safari browsers can
        // render the upload. Non-HEIC files pass through untouched.
        if (isImage) {
          file = await maybeConvertHeic(file);
        }

        // Check storage quota
        const estimate = await mediaStorage.getStorageEstimate();
        if (estimate.percentage > 80) {
          setStorageWarning(true);
        }

        // Generate thumbnail with error handling for mobile
        let thumbnailDataUrl = "";
        try {
          thumbnailDataUrl = await generateThumbnail(file);
        } catch (thumbError) {
          console.warn(
            "Thumbnail generation failed, using placeholder:",
            thumbError,
          );
          // Continue without thumbnail - better than failing entirely
        }

        // Store full blob in IndexedDB
        const blobId = await mediaStorage.save(file, file.name);

        // Add to Zustand state
        addUploadedContext({
          id: crypto.randomUUID(),
          sourceType: "upload",
          blobId,
          filename: file.name,
          mimeType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
          thumbnailDataUrl,
          caption: "",
          type: isVideo ? "video" : "image",
        });
      }
    } catch (error) {
      console.error("Upload failed:", error);
      notifyFile.uploadFailed();
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Internal thumbnail reorder drags shouldn't light up the file-drop zone.
    if (e.dataTransfer.types.includes(REORDER_MIME)) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleLibraryPick = (assets: UserAsset[]) => {
    // Each library asset becomes a new context item that references the
    // already-uploaded storage object. No re-upload at save time because
    // sourceType is "url" (uploadContextImages only runs for sourceType=upload).
    for (const asset of assets) {
      if (asset.mediaType === "audio") continue; // audio handled elsewhere
      addUploadedContext({
        id: crypto.randomUUID(),
        sourceType: "url",
        filename: asset.fileName,
        mimeType: asset.mimeType,
        storage_path: asset.storagePath,
        storage_url: asset.storageUrl,
        thumbnail_storage_path: asset.thumbnailStoragePath ?? undefined,
        thumbnail_storage_url: asset.thumbnailStorageUrl ?? undefined,
        url: asset.storageUrl,
        caption: "",
        type: asset.mediaType === "video" ? "video" : "image",
      });
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.types.includes(REORDER_MIME)) return; // thumbnail reorder, not a file drop

    const files = e.dataTransfer.files;
    await handleFileSelect(files);
  };

  const getDisplaySource = (item: ContextItem) =>
    item.thumbnail_storage_url ||
    item.thumbnailDataUrl ||
    item.storage_url ||
    item.url ||
    item.src ||
    "";

  const handleMakeMainImage = async (imageIndex: number) => {
    if (!user) {
      notifyAuth.pleaseSignIn();
      return;
    }

    const contextImage = context[imageIndex];
    if (!contextImage) return;

    // Get current project ID for parent linking
    const currentProjectId = store.projectId;

    try {
      // Create metadata for new file, copying from current file
      // Carry over all context images EXCEPT the one being promoted to main
      const newContext = context.filter((_, idx) => idx !== imageIndex);

      // Add the originating file's primary image as a linked image in the new file
      if (store.imageSrc) {
        newContext.push({
          id: crypto.randomUUID(),
          url: store.imageSrc,
          src: store.imageSrc,
          caption: "",
          type: "image",
          sourceType: "url",
        });
      }

      const newMetadata = {
        backStory,
        context: newContext, // Carry over remaining context images + originating primary image
        links,
        creativeCommons,
        ethics,
        photographerInfo,
        location,
        photoMetadata,
        meta: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          editorVersion: meta?.editorVersion || "1.0.0",
          mode: meta?.mode || mode,
        },
      };

      // Generate unique slug based on original file and context image
      const baseSlug = projectSlug || "file";
      const timestamp = Date.now();
      const newSlug = `${baseSlug}-${timestamp}`;

      // Chain the new project to this one. The server publishes it to the
      // gallery when the account's gallery limit allows.
      if (!currentProjectId) {
        notifySave.createFailed("Save this project before linking from it");
        return;
      }

      const { project: newProject, warnings } = await createChildProject(currentProjectId, {
        metadata: newMetadata,
        slug: newSlug,
      });

      notifyFile.linkedCreated();
      if (warnings.includes("GALLERY_LIMIT_REACHED")) notifyPublish.limitReached();

      // Navigate to new file
      window.location.href = `/?file=${newProject.id}`;
    } catch (error) {
      console.error("Failed to create new file from context image:", error);
      notifySave.createFailed(error instanceof Error ? error.message : "Unknown error");
    }
  };

  // Show section if context exists, otherwise hide in minimal mode if not selected
  if (
    context.length === 0 &&
    mode === "minimal" &&
    !selectedCorners.relatedImagery
  )
    return null;

  return (
    <section className="mb-4 sm:mb-6">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsExpanded(!isExpanded); } }}
        className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity cursor-pointer"
      >
        <SectionHeader
          title="Related Imagery"
          color="corner-context"
          cornerLabel="context · upper-left"
          tooltipTitle="Related Imagery (Upper Left)"
          tooltipContent="Here one adds imagery (photo, video, drawing) that explains more about the photograph. For example, one can put a family photograph of the three-year-old refugee boy who drowned showing him with his family on a holiday, so that the reader does not just think of him as a victim. Or one can show other photos or a video of the same scene that one photographed to give more context, for example showing the landscape in which one photographed a particular animal, etc."
          className=""
        >
          <svg
            className={`w-4 h-4 ml-auto text-corner-context transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </SectionHeader>
      </div>

      {isExpanded && (
        <div className="space-y-3 mt-3">
          {/* Show existing images */}
          {context.length > 0 && (
            <div className="mb-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {context.map((item, i) => {
                  const displaySrc = getDisplaySource(item);

                  return (
                    <button
                      key={item.id || i}
                      onClick={() => {
                        setSelectedImageIndex(i);
                        setViewerOpen(true);
                      }}
                      draggable
                      aria-roledescription="sortable"
                      onDragStart={(e) => {
                        e.dataTransfer.setData(REORDER_MIME, String(i));
                        e.dataTransfer.effectAllowed = "move";
                        setReorderFrom(i);
                      }}
                      onDragEnd={() => {
                        setReorderFrom(null);
                        setReorderOver(null);
                      }}
                      onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes(REORDER_MIME)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        setReorderOver(i);
                      }}
                      onDrop={(e) => {
                        if (!e.dataTransfer.types.includes(REORDER_MIME)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const from = Number(e.dataTransfer.getData(REORDER_MIME));
                        if (!Number.isNaN(from)) reorderContext(from, i);
                        setReorderFrom(null);
                        setReorderOver(null);
                      }}
                      className={`relative flex-shrink-0 w-16 h-16 sm:w-14 sm:h-14 bg-surface rounded-lg border overflow-hidden group hover:border-corner-context transition-colors ${
                        reorderOver === i && reorderFrom !== null && reorderFrom !== i
                          ? "border-corner-context border-2"
                          : "border-border"
                      } ${reorderFrom === i ? "opacity-50 cursor-grabbing" : "cursor-grab active:cursor-grabbing"}`}
                      title={`${item.filename || item.url || "Media"} — drag to reorder · click to view`}
                    >
                      {item.type === "video" && item.sourceType === "upload" ? (
                        <div className="w-full h-full bg-black flex items-center justify-center">
                          <svg
                            className="w-6 h-6 text-gray-500"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                          </svg>
                        </div>
                      ) : (
                        <img
                          src={displaySrc}
                          alt={item.caption || "Context media"}
                          className="w-full h-full object-cover fc-protected-img"
                          draggable={false}
                        />
                      )}
                      {/* Rich media badges */}
                      <div className="absolute top-0.5 right-0.5 flex gap-0.5">
                        {(item.audioStorageUrl || item.audioDataUrl) && (
                          <div
                            className="w-4 h-4 bg-corner-context/90 rounded-full flex items-center justify-center"
                            title="Has audio"
                          >
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                            </svg>
                          </div>
                        )}
                        {item.caption && (
                          <div
                            className="w-4 h-4 bg-corner-context/90 rounded-full flex items-center justify-center"
                            title="Has caption"
                          >
                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 fc-focus-reveal transition-opacity">
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {context.length} item{context.length !== 1 ? "s" : ""} •{" "}
                {context.filter((i) => i.sourceType === "upload").length}{" "}
                uploaded
                <span className="text-gray-500 ml-1">
                  — click to edit captions, audio, and metadata
                </span>
              </p>
            </div>
          )}

          {storageWarning && (
            <div className="mb-3 p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <svg
                  className="w-4 h-4 text-orange-700 dark:text-orange-400 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-xs text-orange-700 dark:text-orange-400">
                  Storage is over 80% full. Consider removing unused media.
                </p>
              </div>
            </div>
          )}

          {/* Single drop area with two inline action icons (upload / library).
              Persona context-corner tint on the box restores the signature
              color; drag-drop still targets the whole box. */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`mb-3 p-6 border-2 border-dashed rounded-lg transition-colors ${
              isDragging
                ? "border-corner-context bg-corner-context/20"
                : "border-corner-context/40 bg-corner-context/5 hover:border-corner-context/60"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.heic,.heif"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
            <div className="text-center">
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-corner-context border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-gray-400">Uploading...</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload images or videos"
                      aria-label="Upload images or videos"
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-alt flex items-center justify-center text-gray-500 hover:text-corner-context hover:bg-corner-context/10 transition-colors"
                    >
                      <Upload className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setLibraryOpen(true)}
                      title="Browse your library"
                      aria-label="Browse your library"
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-alt flex items-center justify-center text-gray-500 hover:text-corner-context hover:bg-corner-context/10 transition-colors"
                    >
                      <Library className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Drop, upload, or browse your library
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-600 mt-1">
                    Images up to {formatBytes(MAX_UPLOAD_BYTES.image)} ·
                    Videos up to {formatBytes(MAX_UPLOAD_BYTES.video)}
                  </p>
                </>
              )}
            </div>
          </div>


          {context.length === 0 && (
            <p className="text-xs text-gray-600 mt-2">
              Before/after photos, video of scene, comparative images
            </p>
          )}
        </div>
      )}

      <AddContextDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onAdd={addContext}
      />

      <AssetLibraryModal
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={handleLibraryPick}
        multiSelect
        allowedTypes={["image", "video"]}
        title="Add from your library"
      />

      <ContextImageViewer
        isOpen={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setSelectedImageIndex(null);
        }}
        image={selectedImageIndex !== null ? context[selectedImageIndex] : null}
        onRemove={
          selectedImageIndex !== null
            ? () => {
                removeContext(selectedImageIndex);
                setViewerOpen(false);
                setSelectedImageIndex(null);
              }
            : undefined
        }
        onUpdateCaption={
          selectedImageIndex !== null
            ? (caption) => {
                updateContext(selectedImageIndex, { caption });
              }
            : undefined
        }
        onUpdateDescription={
          selectedImageIndex !== null
            ? (description) => {
                updateContext(selectedImageIndex, { description });
              }
            : undefined
        }
        onUpdateCredit={
          selectedImageIndex !== null
            ? (credit) => {
                updateContext(selectedImageIndex, { credit });
              }
            : undefined
        }
        onUpdateDate={
          selectedImageIndex !== null
            ? (date) => {
                updateContext(selectedImageIndex, { date });
              }
            : undefined
        }
        onUpdateAudio={
          selectedImageIndex !== null
            ? (audioData) => {
                if (audioData) {
                  updateContext(selectedImageIndex, {
                    audioDataUrl: audioData.audioDataUrl,
                    audioMimeType: audioData.audioMimeType,
                    audioDuration: audioData.audioDuration,
                  });
                } else {
                  updateContext(selectedImageIndex, {
                    audioDataUrl: undefined,
                    audioStorageUrl: undefined,
                    audioMimeType: undefined,
                    audioDuration: undefined,
                  });
                }
              }
            : undefined
        }
        onMakeMainImage={
          selectedImageIndex !== null
            ? () => handleMakeMainImage(selectedImageIndex)
            : undefined
        }
        onReplace={
          selectedImageIndex !== null
            ? (asset) => {
                // Swap the current context item's media source to the picked
                // library asset. We replace URL + path + thumbnails and clear
                // any blob/data references so the save flow doesn't re-upload.
                updateContext(selectedImageIndex, {
                  sourceType: "url",
                  filename: asset.fileName,
                  mimeType: asset.mimeType,
                  storage_path: asset.storagePath,
                  storage_url: asset.storageUrl,
                  thumbnail_storage_path:
                    asset.thumbnailStoragePath ?? undefined,
                  thumbnail_storage_url:
                    asset.thumbnailStorageUrl ?? undefined,
                  url: asset.storageUrl,
                  src: asset.storageUrl,
                  type: asset.mediaType === "video" ? "video" : "image",
                  // Clear any old IndexedDB blob reference so the original
                  // file isn't re-uploaded on save.
                  blobId: undefined,
                  thumbnailDataUrl: undefined,
                });
              }
            : undefined
        }
        imageIndex={selectedImageIndex ?? 0}
      />
    </section>
  );
}
