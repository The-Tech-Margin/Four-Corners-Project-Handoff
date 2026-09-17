"use client";

import { useState, useMemo } from "react";
import { useFourCornersStore } from "@/lib/store";

interface MetadataInspectorProps {
  initiallyExpanded?: boolean;
}

export function MetadataInspector({
  initiallyExpanded = false,
}: MetadataInspectorProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  // Subscribe to ALL metadata fields for real-time updates
  // Using individual selectors ensures component re-renders when any field changes
  const backStory = useFourCornersStore((state) => state.backStory);
  const context = useFourCornersStore((state) => state.context);
  const links = useFourCornersStore((state) => state.links);
  const creativeCommons = useFourCornersStore((state) => state.creativeCommons);
  const ethics = useFourCornersStore((state) => state.ethics);
  const photographerInfo = useFourCornersStore((state) => state.photographerInfo);
  const location = useFourCornersStore((state) => state.location);
  const photoMetadata = useFourCornersStore((state) => state.photoMetadata);
  const voiceTranscriptions = useFourCornersStore((state) => state.voiceTranscriptions);
  const meta = useFourCornersStore((state) => state.meta);

  // Build complete metadata object - memoized to avoid unnecessary re-renders
  const metadata = useMemo(() => {
    const data: Record<string, unknown> = {};

    // Only include non-empty fields for cleaner display
    if (backStory && (backStory.text || backStory.author || backStory.publication)) {
      data.backStory = backStory;
    }
    if (context && context.length > 0) {
      data.context = context;
    }
    if (links && links.length > 0) {
      data.links = links;
    }
    if (creativeCommons && (creativeCommons.copyright || creativeCommons.description)) {
      data.creativeCommons = creativeCommons;
    }
    if (ethics && Object.values(ethics).some(Boolean)) {
      data.ethics = ethics;
    }
    if (photographerInfo && Object.values(photographerInfo).some(Boolean)) {
      data.photographerInfo = photographerInfo;
    }
    if (location && (location.latitude || location.longitude || location.formattedLocation)) {
      data.location = location;
    }
    if (photoMetadata) {
      data.photoMetadata = photoMetadata;
    }
    if (voiceTranscriptions && voiceTranscriptions.length > 0) {
      data.voiceTranscriptions = voiceTranscriptions;
    }
    if (meta) {
      data.meta = meta;
    }

    return data;
  }, [backStory, context, links, creativeCommons, ethics, photographerInfo, location, photoMetadata, voiceTranscriptions, meta]);

  const jsonString = JSON.stringify(metadata, null, 2);

  return (
    <div className="mt-8 border-t border-border/30 pt-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 rounded-lg bg-surface/50 hover:bg-surface transition-colors text-left border border-border/30"
        aria-expanded={isExpanded}
        aria-label="Metadata Inspector"
      >
        <div className="flex items-center gap-2">
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
              d="M9 5l7 7-7 7"
            />
          </svg>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Metadata Inspector
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-3 bg-surface rounded-lg border border-border/30 overflow-hidden">
          {/* Header with live indicator */}
          <div className="flex items-center justify-between px-4 py-2 bg-surface-alt/50 border-b border-border/30">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                Live Preview
              </span>
            </div>
            {meta?.updatedAt && (
              <span className="text-[10px] text-gray-600">
                Updated: {new Date(meta.updatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          {/* JSON content */}
          <div className="p-4 overflow-x-auto max-h-[60vh] overflow-y-auto">
            <pre className="text-[11px] text-gray-200 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {jsonString}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
