import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { FourCornersErrorAnimation } from "@/components/four-corners-error-animation";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      {/* Spacer for fixed header */}
      <div className="h-14 sm:h-16" />
      <main
        className="flex flex-col items-center justify-center px-4"
        style={{ minHeight: "calc(100vh - 120px)" }}
      >
        <div className="text-center max-w-md">
          <FourCornersErrorAnimation variant="not-found" />

          <h1 className="text-6xl font-bold text-gray-100 mb-2">404</h1>
          <h2 className="text-xl font-medium text-gray-300 mb-4">
            Lost in the Darkroom
          </h2>
          <p className="text-gray-400 mb-8">
            This page never developed. It doesn&apos;t exist, was moved, or wandered
            out of frame.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="px-6 py-3 bg-accent hover:bg-accent/90 text-gray-900 font-medium rounded-lg transition-colors"
            >
              Go Home
            </Link>
            <Link
              href="/gallery"
              className="px-6 py-3 bg-surface-alt hover:bg-surface border border-border text-gray-300 rounded-lg transition-colors"
            >
              Browse Gallery
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
