"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { FourCornersErrorAnimation } from "@/components/four-corners-error-animation";
import { useFourCornersStore } from "@/lib/store";

/**
 * Route-level error boundary — catches rendering errors in any page segment.
 * Renders inside root layout (header, footer, globals.css all available).
 *
 * If the error appears to be a network / fetch failure we show a
 * maintenance-flavoured message; otherwise a general error page.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isMaintenance, setIsMaintenance] = useState(false);
  const projectId = useFourCornersStore((s) => s.projectId);

  useEffect(() => {
    console.error("[ErrorBoundary]", error);

    // Heuristic: network failures and 5xx responses hint at maintenance / downtime
    const msg = (error.message || "").toLowerCase();
    if (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("503") ||
      msg.includes("502") ||
      msg.includes("maintenance") ||
      msg.includes("econnrefused") ||
      msg.includes("failed to load")
    ) {
      setIsMaintenance(true);
    }
  }, [error]);

  const handleRetry = () => {
    if (projectId) {
      // Navigate back to the project — full reload re-fetches from DB
      window.location.href = `/?file=${projectId}`;
    } else {
      // No project context — use the Next.js error boundary reset
      reset();
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <div className="h-14 sm:h-16" />

      <main
        className="flex flex-col items-center justify-center px-4"
        style={{ minHeight: "calc(100vh - 120px)" }}
      >
        <div className="text-center max-w-lg">
          <FourCornersErrorAnimation
            variant={isMaintenance ? "maintenance" : "error"}
          />

          {isMaintenance ? (
            <>
              <h1 className="text-4xl sm:text-5xl font-bold text-gray-100 mb-3">
                Under the Lens
              </h1>
              <p className="text-lg text-gray-400 mb-2">
                We're adjusting the aperture. The app is briefly down for maintenance.
              </p>
              <p className="text-sm text-gray-500 mb-8">
                Like a long exposure, good things take a little patience.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-4xl sm:text-5xl font-bold text-gray-100 mb-3">
                Out of Frame
              </h1>
              <p className="text-lg text-gray-400 mb-2">
                Something slipped past the viewfinder. An unexpected error occurred.
              </p>
              <p className="text-sm text-gray-500 mb-8">
                The corners scattered — let's try to recompose the shot.
              </p>
            </>
          )}

          {error.digest && (
            <p className="text-xs text-gray-600 font-mono mb-6">
              Ref: {error.digest}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleRetry}
              className="px-6 py-3 bg-accent hover:bg-accent/90 text-gray-900 font-medium rounded-lg transition-colors cursor-pointer"
            >
              {isMaintenance ? "Retry" : "Try again"}
            </button>
            <a
              href="/"
              className="px-6 py-3 bg-surface-alt hover:bg-surface border border-border text-gray-300 rounded-lg transition-colors text-center"
            >
              Go Home
            </a>
            <a
              href="/gallery"
              className="px-6 py-3 bg-surface-alt hover:bg-surface border border-border text-gray-300 rounded-lg transition-colors text-center"
            >
              Browse Gallery
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
