"use client";

interface LoadingOverlayProps {
  /** Whether to show the overlay */
  isLoading: boolean;
  /** Optional loading text */
  text?: string;
  /** Show a random fact (ignored, kept for backward compat) */
  showFact?: boolean;
}

/**
 * Full-screen loading overlay with Four Corners animated indicator.
 * Used during state changes that require loading (shared links, project loading, etc.)
 */
export function LoadingOverlay({ isLoading, text = "Loading..." }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-surface/95 backdrop-blur-sm flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Four Corners animated grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <div
            className="w-8 h-8 rounded-lg bg-corner-context fc-corner-pulse"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="w-8 h-8 rounded-lg bg-corner-links fc-corner-pulse"
            style={{ animationDelay: "150ms" }}
          />
          <div
            className="w-8 h-8 rounded-lg bg-corner-backstory fc-corner-pulse"
            style={{ animationDelay: "300ms" }}
          />
          <div
            className="w-8 h-8 rounded-lg bg-corner-creativeCommons fc-corner-pulse"
            style={{ animationDelay: "450ms" }}
          />
        </div>
        <p className="text-sm text-gray-400">{text}</p>
      </div>
    </div>
  );
}
