"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { togglePublish } from "@/lib/db/projects";
import { MessageDialog } from "./message-dialog";
import { ShareModal } from "./share-modal";

interface FileEditorMenuProps {
  fileId: string;
  fileSlug: string;
  isPublished: boolean;
  onPublishToggle?: (published: boolean) => void;
}

export function FileEditorMenu({
  fileId,
  fileSlug,
  isPublished,
  onPublishToggle,
}: FileEditorMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [messageDialog, setMessageDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: "info" | "success" | "error";
  }>({ isOpen: false, title: "", message: "", variant: "info" });

  const handleShare = async () => {
    try {
      // Auto-publish file before sharing
      await togglePublish(fileId, true);

      if (onPublishToggle) onPublishToggle(true);

      // Close menu and show share modal
      setIsOpen(false);
      setShowShareModal(true);
    } catch (error) {
      console.error("Failed to share:", error);
      setMessageDialog({
        isOpen: true,
        title: "Share Failed",
        message: "Could not prepare file for sharing. Please try again.",
        variant: "error",
      });
    }
  };

  const handleTogglePublish = async () => {
    try {
      const newPublishedState = !isPublished;
      await togglePublish(fileId, newPublishedState);

      setMessageDialog({
        isOpen: true,
        title: newPublishedState ? "Published" : "Unpublished",
        message: newPublishedState
          ? "File is now publicly visible"
          : "File is now private",
        variant: "success",
      });
      setIsOpen(false);

      if (onPublishToggle) onPublishToggle(newPublishedState);
    } catch (error) {
      console.error("Failed to toggle publish:", error);
      setMessageDialog({
        isOpen: true,
        title: "Update Failed",
        message: error instanceof Error ? error.message : "Failed to update visibility",
        variant: "error",
      });
    }
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-surface-alt rounded text-sm font-medium transition-colors text-gray-200"
          aria-label="File actions"
        >
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
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
          <span className="hidden sm:inline">File</span>
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 menu-dropdown border border-border rounded-lg shadow-lg py-1 z-50">
            {/* Share File Link */}
            <button
              onClick={handleShare}
              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-surface-alt transition-colors flex items-center gap-2"
            >
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
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              Share File Link
            </button>

            {/* Toggle Publish */}
            <button
              onClick={handleTogglePublish}
              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-surface-alt transition-colors flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isPublished ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                )}
              </svg>
              {isPublished ? "Make Private" : "Make Public"}
            </button>

            <div className="border-t border-border my-1" />

            {/* Dashboard */}
            <button
              onClick={() => {
                setIsOpen(false);
                router.push("/dashboard");
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-surface-alt transition-colors flex items-center gap-2"
            >
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
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"
                />
              </svg>
              My Dashboard
            </button>
          </div>
        )}
      </div>

      <MessageDialog
        isOpen={messageDialog.isOpen}
        onClose={() => setMessageDialog({ ...messageDialog, isOpen: false })}
        title={messageDialog.title}
        message={messageDialog.message}
        variant={messageDialog.variant}
      />

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={`${
          typeof window !== "undefined" ? window.location.origin : ""
        }/?file=${fileSlug}`}
        fileSlug={fileSlug}
      />
    </>
  );
}
