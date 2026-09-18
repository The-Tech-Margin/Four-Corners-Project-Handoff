"use client";

import { useState } from "react";

interface SharedProjectBannerProps {
  projectSlug: string;
  projectOwner?: string;
  isLoggedIn: boolean;
  currentUserId?: string;
  onCopyProject: () => void;
  onLogin: () => void;
}

export function SharedProjectBanner({
  projectSlug,
  projectOwner,
  isLoggedIn,
  currentUserId,
  onCopyProject,
  onLogin,
}: SharedProjectBannerProps) {
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    await onCopyProject();
    setCopying(false);
  };

  return (
    <div className="bg-gradient-to-r from-corner-backstory/20 to-corner-context/20 border-b border-border/50 backdrop-blur-sm">
      <div className="max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Info */}
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-corner-backstory flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-300">
                Viewing shared project:{" "}
                <span className="font-mono text-corner-backstory">
                  {projectSlug}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {isLoggedIn
                  ? "This is a read-only view. Copy to your account to edit."
                  : "Sign in to copy this project and make your own edits."}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isLoggedIn ? (
              <button
                onClick={handleCopy}
                disabled={copying}
                className="flex-1 sm:flex-initial px-4 py-2 text-sm font-medium bg-corner-backstory hover:bg-corner-backstory/90 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {copying ? (
                  <>
                    <svg
                      className="animate-spin w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Copying...
                  </>
                ) : (
                  <>
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
                    Copy to My Projects
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={onLogin}
                className="flex-1 sm:flex-initial px-4 py-2 text-sm font-medium bg-corner-backstory hover:bg-corner-backstory/90 text-white rounded transition-colors flex items-center justify-center gap-2"
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
                Sign In to Copy
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
