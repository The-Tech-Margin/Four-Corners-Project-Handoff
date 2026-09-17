"use client";

import { useState } from "react";
import { togglePublish } from "@/lib/db/projects";
import { notifyClipboard, notifyPublish, notifyShare } from "@/lib/notify";
import { encodeProjectId } from "@/lib/encode-id";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

interface ShareButtonProps {
  projectSlug: string;
  projectId?: string;
  isPublished?: boolean;
  variant?: "button" | "menu-item";
  onClose?: () => void;
}

export function ShareButton({
  projectSlug,
  projectId,
  isPublished = false,
  variant = "button",
  onClose,
}: ShareButtonProps) {
  const { copied, copy } = useCopyToClipboard();
  const [showDialog, setShowDialog] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Use encoded project ID for secure sharing
  const shareUrl = projectId
    ? `${
        typeof window !== "undefined" ? window.location.origin : ""
      }/?file=${encodeProjectId(projectId)}`
    : "";

  const handleCopy = async () => {
    if (!projectId) {
      notifyShare.projectIdMissing();
      return;
    }

    try {
      // Auto-publish project before sharing if not already published
      if (!isPublished && !publishing) {
        setPublishing(true);
        try {
          await togglePublish(projectId, true);
          notifyPublish.published();
        } catch (error) {
          console.error("Failed to publish project:", error);
          notifyPublish.failed();
          setPublishing(false);
          return;
        } finally {
          setPublishing(false);
        }
      }

      const success = await copy(shareUrl);
      if (success) {
        notifyClipboard.linkCopied();
      } else {
        notifyClipboard.failed();
      }
    } catch (error) {
      console.error("Failed to copy:", error);
      notifyClipboard.failed();
    }
  };

  const handleButtonClick = () => {
    if (variant === "button") {
      setShowDialog(true);
    } else {
      handleCopy();
      if (onClose) onClose();
    }
  };

  if (variant === "menu-item") {
    return (
      <button
        onClick={handleButtonClick}
        className="w-full text-left px-4 py-2 text-sm text-corner-backstory hover:bg-surface-alt transition-colors flex items-center gap-2"
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
        {copied ? "Link Copied!" : "Share Project Link"}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleButtonClick}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-corner-backstory/10 hover:bg-corner-backstory/20 text-corner-backstory border border-corner-backstory/30 rounded transition-colors"
        aria-label="Share project"
        title="Share project link"
      >
        <svg
          className="w-3.5 h-3.5"
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
        Share
      </button>

      {showDialog && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowDialog(false)}
          />

          {/* Dialog */}
          <div className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 flex items-center justify-center">
            <div
              className="border border-border rounded-xl shadow-2xl p-5 sm:p-6 w-full sm:w-[28rem] max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: "var(--modal-bg, #1a1a1a)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-200">
                  Share Project
                </h3>
                <button
                  onClick={() => setShowDialog(false)}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label="Close"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Publishing status info */}
              {!isPublished && (
                <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <div>
                      <p className="text-xs font-medium text-orange-400 mb-1">
                        File Not Published
                      </p>
                      <p className="text-xs text-orange-300/80">
                        This file will be automatically published when you copy
                        the share link. Only published files can be shared.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isPublished && (
                <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <p className="text-xs font-medium text-green-400 mb-1">
                        Published & Ready to Share
                      </p>
                      <p className="text-xs text-green-300/80">
                        Anyone with this link can view your file
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* URL Display and Copy */}
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-surface-alt border border-border rounded text-gray-300 focus:outline-none focus:ring-2 focus:ring-corner-backstory/50 truncate"
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={handleCopy}
                  disabled={publishing}
                  className={`shrink-0 px-4 py-2.5 text-sm font-medium rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    copied
                      ? "bg-green-500/20 text-green-400 border border-green-500/50"
                      : "bg-corner-backstory/10 text-corner-backstory border border-corner-backstory/30 hover:bg-corner-backstory/20"
                  }`}
                >
                  {publishing ? (
                    <span className="flex items-center gap-1">
                      <div className="w-4 h-4 border-2 border-corner-backstory border-t-transparent rounded-full animate-spin" />
                      Publishing...
                    </span>
                  ) : copied ? (
                    <span className="flex items-center gap-1">
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
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Copied
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
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
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      Copy Link
                    </span>
                  )}
                </button>
              </div>

              {/* Security info */}
              <div className="text-xs text-gray-600 flex items-start gap-1.5">
                <svg
                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <span>
                  Secure ID-based link · Only published files accessible
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
