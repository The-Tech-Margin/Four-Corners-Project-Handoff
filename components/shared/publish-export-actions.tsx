/**
 * Shared Publish / Export action buttons used by all editor modes.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useFourCornersStore } from "@/lib/store";
import { notify } from "@/lib/notify";
import { togglePublish, toggleGallery } from "@/lib/db/projects";

interface PublishExportActionsProps {
  isPublished: boolean;
  inGallery: boolean;
  onPublishToggle: (published: boolean) => void;
  onGalleryToggle: (inGallery: boolean) => void;
  onExport: () => void;
  /** Optional extra className for the wrapper */
  className?: string;
}

export function PublishExportActions({
  isPublished,
  inGallery,
  onPublishToggle,
  onGalleryToggle,
  onExport,
  className = "",
}: PublishExportActionsProps) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        onClick={async () => {
          const id = useFourCornersStore.getState().projectId;
          if (!id) {
            notify.info("Save first to publish");
            return;
          }
          try {
            if (inGallery) {
              await toggleGallery(id, false);
              onGalleryToggle(false);
              notify.info("Unpublished");
            } else {
              if (!isPublished) {
                await togglePublish(id, true);
                onPublishToggle(true);
              }
              await toggleGallery(id, true);
              onGalleryToggle(true);
              notify.success("Published");
            }
          } catch (err) {
            notify.error(err instanceof Error ? err.message : "Failed");
          }
        }}
        className={`flex-1 py-3 text-sm font-medium rounded-xl transition-colors ${
          inGallery
            ? "text-white bg-red-600 hover:bg-red-500"
            : "text-white bg-corner-context hover:bg-corner-context/90"
        }`}
      >
        {inGallery ? "Unpublish" : "Publish"}
      </button>
      <button
        onClick={onExport}
        className="flex-1 py-3 text-sm font-medium text-gray-900 bg-corner-backstory hover:bg-corner-backstory/90 rounded-xl transition-colors"
      >
        Export
      </button>
    </div>
  );
}
