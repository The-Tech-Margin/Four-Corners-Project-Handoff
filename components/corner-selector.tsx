"use client";

import { useFourCornersStore } from "@/lib/store";

export function CornerSelector() {
  const mode = useFourCornersStore((state) => state.mode);
  const selectedCorners = useFourCornersStore((state) => state.selectedCorners);
  const toggleCornerSelection = useFourCornersStore(
    (state) => state.toggleCornerSelection
  );

  if (mode !== "minimal") return null;

  const selectedCount = Object.values(selectedCorners).filter(Boolean).length;

  return (
    <div className="mb-6 bg-surface/80 border border-border rounded-xl p-4">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-gray-300 mb-1">
          Choose Your Corners
        </h3>
        <p className="text-xs text-gray-500">
          Select 1 or 2 additional corners to complete. Authorship is always
          required.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
        <button
          onClick={() => toggleCornerSelection("backstory")}
          disabled={!selectedCorners.backstory && selectedCount === 2}
          className={`
            relative p-3 rounded-lg border-2 transition-all text-left h-full
            ${
              selectedCorners.backstory
                ? "border-corner-backstory bg-corner-backstory/10"
                : "border-border/50 bg-surface-alt hover:border-corner-backstory/50"
            }
            ${
              !selectedCorners.backstory && selectedCount === 2
                ? "opacity-40 cursor-not-allowed"
                : "cursor-pointer"
            }
          `}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                selectedCorners.backstory
                  ? "border-corner-backstory bg-corner-backstory"
                  : "border-border-light"
              }`}
            >
              {selectedCorners.backstory && (
                <svg
                  className="w-3 h-3 text-gray-900"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-sm bg-corner-backstory"></div>
                <span className="text-sm font-medium text-corner-backstory">
                  Backstory
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Context from photographer or witness
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => toggleCornerSelection("relatedImagery")}
          disabled={!selectedCorners.relatedImagery && selectedCount === 2}
          className={`
            relative p-3 rounded-lg border-2 transition-all text-left h-full
            ${
              selectedCorners.relatedImagery
                ? "border-corner-context bg-corner-context/10"
                : "border-border/50 bg-surface-alt hover:border-corner-context/50"
            }
            ${
              !selectedCorners.relatedImagery && selectedCount === 2
                ? "opacity-40 cursor-not-allowed"
                : "cursor-pointer"
            }
          `}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                selectedCorners.relatedImagery
                  ? "border-corner-context bg-corner-context"
                  : "border-border-light"
              }`}
            >
              {selectedCorners.relatedImagery && (
                <svg
                  className="w-3 h-3 text-gray-900"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-sm bg-corner-context"></div>
                <span className="text-sm font-medium text-corner-context">
                  Related Imagery
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Before/after photos, videos
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => toggleCornerSelection("links")}
          disabled={!selectedCorners.links && selectedCount === 2}
          className={`
            relative p-3 rounded-lg border-2 transition-all text-left h-full
            ${
              selectedCorners.links
                ? "border-corner-links bg-corner-links/10"
                : "border-border/50 bg-surface-alt hover:border-corner-links/50"
            }
            ${
              !selectedCorners.links && selectedCount === 2
                ? "opacity-40 cursor-not-allowed"
                : "cursor-pointer"
            }
          `}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                selectedCorners.links
                  ? "border-corner-links bg-corner-links"
                  : "border-border-light"
              }`}
            >
              {selectedCorners.links && (
                <svg
                  className="w-3 h-3 text-gray-900"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-sm bg-corner-links"></div>
                <span className="text-sm font-medium text-corner-links">
                  Links
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Articles, videos, maps
              </p>
            </div>
          </div>
        </button>
      </div>

      <p className="text-xs text-gray-600 mt-3 text-center">
        {selectedCount === 2
          ? "Maximum 2 additional corners selected"
          : `${selectedCount}/2 additional corners selected`}
      </p>
    </div>
  );
}
