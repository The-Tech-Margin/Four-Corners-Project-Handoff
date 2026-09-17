"use client";

import { useState } from "react";

interface PreBetaBadgeProps {
  variant?: "inline" | "expanded";
  className?: string;
}

export function PreBetaBadge({
  variant = "inline",
  className = "",
}: PreBetaBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (variant === "inline") {
    return (
      <div className="relative inline-block">
        <button
          onClick={() => setShowTooltip(!showTooltip)}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-500 hover:bg-orange-500/30 hover:border-orange-500/60 hover:scale-110 transition-all cursor-pointer ${className}`}
          aria-label="Pre-Beta version indicator"
          type="button"
        >
          <svg
            className="w-3 h-3"
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
        </button>

        {/* Tooltip */}
        {showTooltip && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 pointer-events-none"
            role="tooltip"
          >
            <div className="bg-gray-900 dark:bg-gray-900 border border-orange-500/50 rounded-lg shadow-xl px-3 py-2 text-xs whitespace-nowrap backdrop-blur-sm">
              <div className="font-semibold text-orange-400 mb-1">Pre-Beta</div>
              <div className="text-gray-300 dark:text-gray-400">
                Active development
              </div>
            </div>
            {/* Arrow pointing up */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-b-4 border-b-orange-500/50"></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-lg bg-surface-alt/50 border border-border/30 backdrop-blur-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <svg
            className="w-4 h-4 text-gray-500"
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
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-300 mb-1">
            Pre-Beta Version
          </p>
          <p className="text-sm text-gray-500 leading-relaxed">
            This tool is in active development. Features, UI, and data
            structures may change.
            <span className="block mt-2 text-gray-400">
              Please export your work as JSON for backup.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
