"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { useFourCornersStore } from "@/lib/store";
import { ProjectPickerModal } from "./project-picker-modal";
import type { ProjectRecord } from "@/lib/db/projects";

export function LoadButton() {
  const [showPicker, setShowPicker] = useState(false);
  const hasUnsavedChanges = useFourCornersStore(
    (state) => state.hasUnsavedChanges
  );
  const importMetadata = useFourCornersStore((state) => state.importMetadata);
  const setProjectId = useFourCornersStore((state) => state.setProjectId);
  const markSaved = useFourCornersStore((state) => state.markSaved);

  const handleOpen = () => {
    const supabase = createClient();
    if (!supabase) {
      toast.error(
        "Supabase is not configured. Please add your Supabase credentials to .env.local"
      );
      return;
    }

    if (hasUnsavedChanges) {
      const ok = confirm(
        "You have unsaved changes. Loading a project will discard them. Continue?"
      );
      if (!ok) return;
    }
    setShowPicker(true);
  };

  const handleSelect = async (project: ProjectRecord) => {
    // Load metadata into store
    importMetadata(project.metadata);
    setProjectId(project.id, project.slug || "", project.title ?? undefined);
    markSaved();

    // Load main image if available
    if (project.main_image_url) {
      useFourCornersStore.setState({
        imageSrc: project.main_image_url,
        mainImageStoragePath: project.main_image_storage_path ?? null,
      });
    }

    setShowPicker(false);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="px-3 py-1.5 text-xs font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
      >
        Load
      </button>

      <ProjectPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleSelect}
      />
    </>
  );
}
