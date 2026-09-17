"use client";

import { useFourCornersStore } from "@/lib/store";
import { FCPhotoViewer } from "@/components/viewer/fc-photo-viewer";

interface FourCornersJsPreviewProps {
  onCornerClick?: (sectionId: string) => void;
}

/**
 * Four Corners Preview using native React implementation
 *
 * Replaces the CDN-loaded fourcorners.js with native components
 * that replicate the exact UX while using your theme system.
 */
export function FourCornersJsPreview({ onCornerClick }: FourCornersJsPreviewProps) {
  const imageSrc = useFourCornersStore((state) => state.imageSrc);
  const backStory = useFourCornersStore((state) => state.backStory);
  const context = useFourCornersStore((state) => state.context);
  const links = useFourCornersStore((state) => state.links);
  const creativeCommons = useFourCornersStore((state) => state.creativeCommons);
  const ethics = useFourCornersStore((state) => state.ethics);
  const photographerInfo = useFourCornersStore(
    (state) => state.photographerInfo
  );
  const location = useFourCornersStore((state) => state.location);
  const photoMetadata = useFourCornersStore((state) => state.photoMetadata);
  const mode = useFourCornersStore((state) => state.mode);
  const selectedCorners = useFourCornersStore((state) => state.selectedCorners);
  const voiceTranscriptions = useFourCornersStore(
    (state) => state.voiceTranscriptions
  );
  const projectId = useFourCornersStore((state) => state.projectId);
  const projectSlug = useFourCornersStore((state) => state.projectSlug);

  // Process context images — ensure url fallback for unsaved uploads only
  const processedContext = context.map((item) => {
    if (item.sourceType === "upload" && !item.storage_url && !item.url) {
      return {
        ...item,
        url: item.thumbnailDataUrl || "",
      };
    }
    return item;
  });

  if (!imageSrc) {
    return (
      <div className="mt-6 sm:mt-8 p-6 sm:p-8 bg-surface/50 border border-border rounded-xl">
        <h2 className="text-base sm:text-lg font-medium mb-2 text-gray-300">
          Preview
        </h2>
        <p className="text-sm text-gray-500">
          Upload an image to see the Four Corners preview
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 sm:px-6 py-2.5 border-b border-border">
        <h2 className="text-base sm:text-lg font-medium text-gray-300">
          Four Corners Preview
        </h2>
      </div>

      <div className="p-4 sm:p-6">
        <FCPhotoViewer
          imageSrc={imageSrc}
          imageAlt={creativeCommons.description || "Four Corners image"}
          data={{
            authorship: {
              caption: creativeCommons.description,
              credit: creativeCommons.copyright,
              author: backStory.author,
              ethics: ethics,
              photographerInfo: photographerInfo,
            },
            backstory: backStory,
            imagery: processedContext,
            links: links,
            location: location,
            photoMetadata: photoMetadata,
            voiceTranscriptions: voiceTranscriptions,
          }}
          options={{
            showCutline: true,
          }}
          projectContext={projectId ? {
            projectId: projectId,
            projectSlug: projectSlug || undefined,
          } : undefined}
          mode={mode}
          selectedCorners={selectedCorners}
        />
      </div>
    </div>
  );
}
