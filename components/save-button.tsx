"use client";

import { useState } from "react";
import { useFourCornersStore } from "@/lib/store";
import { useProjectMetadata } from "@/hooks/useProjectMetadata";
import { useProjectSave } from "@/hooks/useProjectSave";
import toast from "react-hot-toast";
import { AuthModal } from "./auth-modal";
import { SlugInputModal } from "./slug-input-modal";

/** Derive a URL-safe slug from a human-readable title. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+/, "");
}

export function SaveButton() {
  const [showAuth, setShowAuth] = useState(false);
  const [showSlugInput, setShowSlugInput] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  const projectId = useFourCornersStore((state) => state.projectId);
  const hasUnsavedChanges = useFourCornersStore(
    (state) => state.hasUnsavedChanges
  );
  const imageSrc = useFourCornersStore((state) => state.imageSrc);
  // A project is savable once it has a main image OR other primary content
  // (e.g. a voice note added from the library). Without this, audio-first
  // drafts with no image yet could never be saved.
  const hasVoiceContent = useFourCornersStore(
    (state) => state.voiceTranscriptions.length > 0
  );

  const { buildMetadata } = useProjectMetadata();
  const { saving, saveStatus, save, createNew, checkAuth } = useProjectSave();

  const handleSave = async () => {
    const metadata = buildMetadata();
    const result = await save(metadata);

    if (result.error) {
      alert(result.error);
    } else if (result.requiresAuth) {
      setShowAuth(true);
    } else if (result.requiresSlug) {
      setShowSlugInput(true);
    }
  };

  const handleCreateProject = async () => {
    const userId = await checkAuth();
    if (!userId) return;

    const title = titleInput.trim();
    if (!title) {
      toast.error("Please enter a project title");
      return;
    }
    const slug = slugify(title);
    if (!slug) {
      toast.error("Title must contain at least one letter or number");
      return;
    }

    const metadata = buildMetadata();
    const result = await createNew(metadata, userId, slug, title);

    if (result.success) {
      setShowSlugInput(false);
      setTitleInput("");
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  const getButtonText = () => {
    if (saveStatus === "saving") return "Saving...";
    if (saveStatus === "saved") return "Saved ✓";
    if (saveStatus === "error") return "Error";
    return projectId ? "Save" : "Save Project";
  };

  const isDisabled =
    saving ||
    (saveStatus === "saved" && !hasUnsavedChanges) ||
    (!imageSrc && !hasVoiceContent);

  return (
    <>
      <button
        onClick={handleSave}
        disabled={isDisabled}
        className={`
          relative px-3 py-1.5 text-xs font-medium rounded
          transition-colors
          ${
            isDisabled
              ? "bg-gray-700 text-gray-500 cursor-not-allowed"
              : "bg-corner-backstory/20 text-corner-backstory hover:bg-corner-backstory/30"
          }
          ${saveStatus === "saved" ? "bg-green-500/20 text-green-400" : ""}
          ${saveStatus === "error" ? "bg-red-500/20 text-red-400" : ""}
        `}
        title={
          !imageSrc
            ? "Upload an image first"
            : hasUnsavedChanges
            ? "Save changes to database"
            : "No unsaved changes"
        }
      >
        {getButtonText()}
        {hasUnsavedChanges && saveStatus === "idle" && (
          <span
            className="absolute top-0 right-0 w-2 h-2 bg-corner-backstory rounded-full"
            aria-label="Unsaved changes"
          />
        )}
      </button>

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => {
          setShowAuth(false);
          handleSave();
        }}
      />

      <SlugInputModal
        isOpen={showSlugInput}
        value={titleInput}
        onChange={setTitleInput}
        onSubmit={handleCreateProject}
        onCancel={() => setShowSlugInput(false)}
        loading={saving}
      />
    </>
  );
}
