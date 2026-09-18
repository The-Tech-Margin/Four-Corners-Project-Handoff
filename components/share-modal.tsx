"use client";

import Modal from "./modal";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  fileSlug: string;
  isPublished?: boolean;
}

export function ShareModal({
  isOpen,
  onClose,
  shareUrl,
  fileSlug: _fileSlug,
  isPublished: _isPublished = true,
}: ShareModalProps) {
  const { copied, copy } = useCopyToClipboard();

  const handleCopy = () => {
    copy(shareUrl);
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent("Check out this Four Corners file");
    const body = encodeURIComponent(
      `I thought you might be interested in this:\n\n${shareUrl}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const handleTwitterShare = () => {
    const text = encodeURIComponent("Check out this Four Corners file");
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(
        shareUrl
      )}`,
      "_blank"
    );
  };

  const handleFacebookShare = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
        shareUrl
      )}`,
      "_blank"
    );
  };

  const handleLinkedInShare = () => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
        shareUrl
      )}`,
      "_blank"
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share File" maxWidth="lg">
      <div className="p-6 space-y-6">
        {/* Success message */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <svg
            className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-green-400">
              File Published Successfully
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Your file is now publicly accessible via the link below
            </p>
          </div>
        </div>

        {/* URL Display with Copy Button */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">
            Share Link
          </label>
          <div className="flex gap-2 items-stretch">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 h-10 px-3 bg-surface border border-border rounded text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/50"
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              onClick={handleCopy}
              className={`h-10 px-4 rounded font-medium text-sm transition-all flex items-center justify-center ${
                copied
                  ? "bg-green-500 text-white"
                  : "bg-accent hover:bg-accent/80 text-gray-900"
              }`}
            >
              {copied ? (
                <span className="flex items-center gap-1.5">
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
                <span className="flex items-center gap-1.5">
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
                  Copy
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Share Options */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-3">
            Share Via
          </label>
          <div className="grid grid-cols-2 gap-3">
            {/* Email */}
            <button
              onClick={handleEmailShare}
              className="flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface-alt border border-border rounded-lg transition-colors text-left"
            >
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm text-gray-200">Email</span>
            </button>

            {/* Twitter */}
            <button
              onClick={handleTwitterShare}
              className="flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface-alt border border-border rounded-lg transition-colors text-left"
            >
              <svg
                className="w-5 h-5 text-gray-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="text-sm text-gray-200">Twitter</span>
            </button>

            {/* Facebook */}
            <button
              onClick={handleFacebookShare}
              className="flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface-alt border border-border rounded-lg transition-colors text-left"
            >
              <svg
                className="w-5 h-5 text-gray-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span className="text-sm text-gray-200">Facebook</span>
            </button>

            {/* LinkedIn */}
            <button
              onClick={handleLinkedInShare}
              className="flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface-alt border border-border rounded-lg transition-colors text-left"
            >
              <svg
                className="w-5 h-5 text-gray-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              <span className="text-sm text-gray-200">LinkedIn</span>
            </button>
          </div>
        </div>

        {/* Publishing Info */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
          <svg
            className="w-4 h-4 text-accent flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-xs text-gray-400 leading-relaxed">
            Anyone with this link can view your file. Only share with trusted
            sources. To make it private again, use the &ldquo;Make Private&rdquo; option in
            the File menu.
          </p>
        </div>
      </div>
    </Modal>
  );
}
