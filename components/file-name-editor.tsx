"use client";

import { useState, useEffect } from "react";
import { useFourCornersStore } from "@/lib/store";
import { updateProjectSlug } from "@/lib/db/projects";
import { notifyFile } from "@/lib/notify";
import { VoiceInput } from "@/components/voice-input";

/**
 * Derive a URL-safe slug from a human-readable title.
 * Preserves hyphens, lowercases, strips special chars, collapses hyphens.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+/, "");
}

export function FileNameEditor() {
  const projectId = useFourCornersStore((state) => state.projectId);
  const projectSlug = useFourCornersStore((state) => state.projectSlug);
  const projectTitle = useFourCornersStore((state) => state.projectTitle);
  const pendingTitle = useFourCornersStore((state) => state.pendingTitle);
  const setPendingTitle = useFourCornersStore((state) => state.setPendingTitle);
  const setPendingSlug = useFourCornersStore((state) => state.setPendingSlug);
  const setProjectId = useFourCornersStore((state) => state.setProjectId);

  const [isEditing, setIsEditing] = useState(false);
  // Title input is seeded from the real title column only. The slug is a
  // URL identifier — it must never become the rendered title value.
  const [editValue, setEditValue] = useState(projectTitle || "");
  const [isSaving, setIsSaving] = useState(false);

  // Update edit value when project changes
  useEffect(() => {
    setEditValue(projectTitle || "");
  }, [projectTitle]);

  // When user types a title in the pending state, auto-derive slug
  const handlePendingTitleChange = (value: string) => {
    setPendingTitle(value);
    setPendingSlug(slugify(value));
  };

  const handleSave = async () => {
    if (!projectId || !editValue.trim()) {
      setIsEditing(false);
      setEditValue(projectTitle || "");
      return;
    }

    const newTitle = editValue.trim();
    const newSlug = slugify(newTitle);

    // No change
    if (newTitle === projectTitle && newSlug === projectSlug) {
      setIsEditing(false);
      return;
    }

    if (!newSlug) {
      notifyFile.nameUpdateFailed();
      setIsEditing(false);
      setEditValue(projectTitle || "");
      return;
    }

    setIsSaving(true);
    try {
      await updateProjectSlug(projectId, newSlug, newTitle);
      setProjectId(projectId, newSlug, newTitle);
      // Also update the title in metadata so it persists to DB
      useFourCornersStore.setState({ hasUnsavedChanges: true });
      notifyFile.nameUpdated();
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update file name:", error);

      // Check for duplicate slug error
      const errCode = (error as { code?: string })?.code;
      const errMsg = error instanceof Error ? error.message : "";
      if (errCode === "23505" || errMsg.includes("duplicate key")) {
        notifyFile.nameTaken(newSlug);
      } else {
        notifyFile.nameUpdateFailed();
      }

      setEditValue(projectTitle || "");
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(projectTitle || "");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  const pencilIcon = (
    <svg
      className="w-4 h-4"
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
  );

  // Derive preview slug from current input
  const previewSlug = pendingTitle ? slugify(pendingTitle) : "";

  // Pending title input — shown whenever there's no saved project yet
  if (!projectId) {
    return (
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-2 h-2 rounded-sm bg-gray-500 flex-shrink-0" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Title
          </span>
        </div>
        <VoiceInput
          value={pendingTitle || ""}
          onChange={handlePendingTitleChange}
          placeholder="My Photo Title"
          ariaLabel="Project title"
          maxRecordingTime={5000}
        />
        {previewSlug && (
          <p className="text-[10px] text-gray-500 mt-1 truncate">
            <span className="text-gray-600">slug:</span>{" "}
            <span className="font-mono">{previewSlug}</span>
          </p>
        )}
      </div>
    );
  }

  // Don't show if project has no slug (shouldn't happen, but guard)
  if (!projectSlug) {
    return null;
  }

  // Display only the real title — never the slug. Empty field is the correct
  // state for legacy projects whose title was never persisted to the column.
  const displayTitle = projectTitle || "";
  const currentSlug = isEditing ? slugify(editValue) : projectSlug;

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-2 h-2 rounded-sm bg-gray-500 flex-shrink-0" />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Title
        </span>
      </div>

      {isEditing ? (
        <>
          <VoiceInput
            value={editValue}
            onChange={(val) => setEditValue(val)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder="My Photo Title"
            ariaLabel="Project title"
            maxRecordingTime={5000}
          />
          {currentSlug && (
            <p className="text-[10px] text-gray-500 mt-1 truncate">
              <span className="text-gray-600">slug:</span>{" "}
              <span className="font-mono">{currentSlug}</span>
            </p>
          )}
        </>
      ) : (
        <>
          {/*
            Wrapper is presentational only — the focusable controls live
            inside (the readOnly input and the pencil button). Both enter
            edit mode on click; the input also responds to Enter / Space
            so keyboard users who tab to the title field can begin editing
            without reaching for the pencil button.
          */}
          <div className="input-icon-wrapper has-icon-right">
            <input
              type="text"
              value={displayTitle}
              readOnly
              className="cursor-pointer"
              aria-label="Project title — press Enter to edit"
              onClick={() => setIsEditing(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsEditing(true);
                }
              }}
            />
            <span className="input-icon-right">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label="Edit title"
                title="Edit title"
              >
                {pencilIcon}
              </button>
            </span>
          </div>
          {currentSlug && (
            <p className="text-[10px] text-gray-500 mt-1 truncate">
              <span className="text-gray-600">slug:</span>{" "}
              <span className="font-mono">{currentSlug}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
