"use client";

import Modal from "./modal";

interface SharedFileImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileSlug: string;
  hasExistingFile: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoggedIn: boolean;
  onLoginRequired?: () => void;
}

export function SharedFileImportDialog({
  isOpen,
  onClose,
  fileSlug,
  hasExistingFile,
  onConfirm,
  onCancel,
  isLoggedIn,
  onLoginRequired,
}: SharedFileImportDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isLoggedIn ? "Copy Shared File?" : "File Shared With You"}
      maxWidth="md"
    >
      <div className="px-4 sm:px-5 py-4">
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
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
            <div>
              <p className="text-sm font-medium text-blue-400 mb-1">
                Someone Shared: <span className="font-mono">&ldquo;{fileSlug}&rdquo;</span>
              </p>
              <p className="text-xs text-blue-300/80">
                {isLoggedIn
                  ? "Copy this file to your account with the same name to edit and save changes."
                  : "Sign in to create your own copy of this file."}
              </p>
            </div>
          </div>
        </div>

        {isLoggedIn ? (
          <>
            <p className="text-sm text-gray-300 mb-4">
              {hasExistingFile
                ? `You already have a file named "${fileSlug}". Copying will overwrite your existing file. This action cannot be undone.`
                : `This will create a new file in your account named "${fileSlug}" with all the shared content. You can then edit and save your own version.`}
            </p>

            <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <svg
                  className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5"
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
                <p className="text-xs text-orange-300/80">
                  <strong className="text-orange-400">Trust Required:</strong>{" "}
                  Only copy files from people you trust. This will{" "}
                  {hasExistingFile ? "replace" : "create"} a file in your
                  account.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 bg-surface-alt hover:bg-surface border border-border rounded text-sm font-medium text-gray-300 hover:text-gray-200 transition-colors"
              >
                No, Just View
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-surface-alt hover:bg-surface border border-border rounded text-sm font-medium text-gray-400 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
                  hasExistingFile
                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                    : "bg-accent hover:bg-accent/80 text-gray-900"
                }`}
              >
                {hasExistingFile ? "Yes, Overwrite" : "Yes, I Trust Sender"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-300 mb-4">
              To create your own editable copy of &ldquo;{fileSlug}&rdquo;, you need to sign
              in first.
            </p>

            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <svg
                  className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5"
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
                <div className="text-xs text-green-300/80">
                  <p className="font-medium text-green-400 mb-1">
                    After signing in:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>File will be copied to your account</li>
                    <li>Keeps the same name: &ldquo;{fileSlug}&rdquo;</li>
                    <li>You can edit and save your own version</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <svg
                  className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5"
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
                <p className="text-xs text-orange-300/80">
                  <strong className="text-orange-400">Trust Required:</strong>{" "}
                  Only proceed if you trust the person who shared this file with
                  you.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 bg-surface-alt hover:bg-surface border border-border rounded text-sm font-medium text-gray-300 hover:text-gray-200 transition-colors"
              >
                No Thanks, Just View
              </button>
              <button
                onClick={onLoginRequired || onClose}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent/80 text-gray-900 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                    d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                  />
                </svg>
                Yes, Sign In to Copy
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
