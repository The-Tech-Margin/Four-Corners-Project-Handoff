/**
 * Scroll Mode — the classic vertical editor layout.
 *
 * This is the default layout mode, extracted from the original
 * page.tsx rendering. Each Four Corners section stacks vertically
 * with section-progress sidebar navigation.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useRouter } from "next/navigation";
import { useFourCornersStore } from "@/lib/store";
import { encodeProjectId } from "@/lib/encode-id";
import { Eye } from "lucide-react";
import { ModeHint } from "@/components/mode-hint";
import { FileNameEditor } from "@/components/file-name-editor";
import { AutosaveIndicator } from "@/components/autosave-indicator";
import { ImageDropZone } from "@/components/image-drop-zone";
import { CornerSelector } from "@/components/corner-selector";
import { CaptionCreditEthics } from "@/components/caption-credit-ethics";
import { BackstoryEditor } from "@/components/backstory-editor";
import { ContextImages } from "@/components/context-images";
import { LinksManager } from "@/components/links-manager";
import { LocationCapture } from "@/components/location-capture";
import { FourCornersJsPreview } from "@/components/four-corners-js-preview";
import { AudioUploadSection } from "@/components/audio-upload-section";
import { MetadataInspector } from "@/components/metadata-inspector";
import { SectionProgress } from "@/components/section-progress";
import { ScrollToTop } from "@/components/scroll-to-top";
import { notify, notifyPublish } from "@/lib/notify";
import {
  togglePublish,
  toggleGallery,
  GALLERY_LIMIT_REACHED,
} from "@/lib/db/projects";
import type { EditorProps } from "@/lib/layout-modes";

export default function ScrollMode({
  sectionRefs,
  onExport,
  onCornerClick,
  viewingSharedProject,
  autosaveStatus,
  lastAutosaveError,
  isPublished,
  inGallery,
  onPublishToggle,
  onGalleryToggle,
}: EditorProps) {
  const router = useRouter();
  const context = useFourCornersStore((state) => state.context);
  const backStory = useFourCornersStore((state) => state.backStory);
  const links = useFourCornersStore((state) => state.links);
  const creativeCommons = useFourCornersStore(
    (state) => state.creativeCommons,
  );
  const photographerInfo = useFourCornersStore(
    (state) => state.photographerInfo,
  );

  return (
    <>
      <div className="max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full">
        <ModeHint />
        <FileNameEditor />
        <AutosaveIndicator status={autosaveStatus} error={lastAutosaveError} />
        <main id="main-content" role="main" aria-label="Project editor">
          {/* Visually hidden h1 so screen readers + page outliners have an
              anchor. The visible title sits in <FileNameEditor /> above. */}
          <h1 className="sr-only">Four Corners project editor</h1>
          <ImageDropZone onCornerClick={onCornerClick} />
          <CornerSelector />
          {/* eslint-disable react-hooks/refs -- passing RefObjects to ref props, not accessing .current */}
          <section
            ref={sectionRefs["credit-ethics"]}
            aria-label="Authorship section: caption, credit, and ethics"
          >
            <CaptionCreditEthics />
          </section>
          <section
            ref={sectionRefs["backstory"]}
            aria-label="Backstory section"
          >
            <BackstoryEditor />
            <AudioUploadSection
              fieldId="backstory-text"
              title="Import Audio for Backstory"
              className="mb-4 sm:mb-6"
            />
          </section>
          <section
            ref={sectionRefs["context-images"]}
            aria-label="Still life context section"
          >
            <ContextImages
              initiallyExpanded={viewingSharedProject || context.length > 0}
            />
          </section>
          <section
            ref={sectionRefs["links"]}
            aria-label="Links section"
          >
            <LinksManager />
          </section>
          {/* eslint-enable react-hooks/refs */}
          <LocationCapture />
        </main>

        <FourCornersJsPreview />

        {/* Preview Gallery — always available in the editor. Opens the public
            /view page in a new tab so the author can see what visitors will
            see, whether the project is in the gallery yet or not. */}
        <section className="pt-2" aria-label="Preview gallery section">
          <button
            type="button"
            onClick={() => {
              const { projectId: currentId, projectSlug } =
                useFourCornersStore.getState();
              if (!currentId) {
                notify.info("Save your file first to preview the gallery view");
                return;
              }
              // Same-tab navigation, matching the dashboard's view button
              // (handleView in dashboard-client.tsx). The previous
              // `window.open(..., "_blank", "noopener")` got silently
              // swallowed by popup blockers in some browser configs.
              const slug = projectSlug || currentId;
              router.push(`/view/${encodeProjectId(slug)}`);
            }}
            aria-label="Open this project in the public viewer"
            // Inline styles on the persona-aware --fc-corner-context var
            // (NOT Tailwind's static @theme token). The /10 /20 /40 opacity
            // modifiers in Tailwind v4 only work on theme-config colors and
            // would lock the button to the dark-default #a855f7 regardless
            // of which persona the user has loaded.
            style={{
              color: "var(--fc-corner-context)",
              background:
                "color-mix(in srgb, var(--fc-corner-context) 10%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--fc-corner-context) 40%, transparent)",
            }}
            className="w-full py-3 sm:py-3.5 text-sm sm:text-base font-medium rounded-xl transition-colors shadow-sm hover:shadow-md border flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fc-bg)] focus-visible:ring-[color:var(--fc-corner-context)]"
          >
            <Eye size={16} aria-hidden="true" />
            Preview Gallery View
          </button>
        </section>

        {/* Publish to Gallery */}
        <section className="pt-2" aria-label="Publish section">
          <button
            type="button"
            onClick={async () => {
              const currentId = useFourCornersStore.getState().projectId;
              if (!currentId) {
                notify.info("Save your file first to publish to the gallery");
                return;
              }
              try {
                if (inGallery) {
                  await toggleGallery(currentId, false);
                  onGalleryToggle(false);
                  notify.info("Unpublished from gallery");
                } else {
                  if (!isPublished) {
                    await togglePublish(currentId, true);
                    onPublishToggle(true);
                  }
                  await toggleGallery(currentId, true);
                  onGalleryToggle(true);
                  notify.success("Published to gallery");
                }
              } catch (err) {
                if (err instanceof Error && err.message === GALLERY_LIMIT_REACHED) {
                  notifyPublish.limitReached();
                  return;
                }
                notify.error(err instanceof Error ? err.message : "Failed to update gallery status");
              }
            }}
            aria-pressed={inGallery}
            className={`w-full py-3 sm:py-3.5 text-sm sm:text-base font-medium rounded-xl transition-colors shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fc-bg)] focus-visible:ring-white ${
              inGallery
                ? "text-white bg-red-600 hover:bg-red-500"
                : "text-white bg-corner-context hover:bg-corner-context/90"
            }`}
          >
            {inGallery ? "Unpublish from Gallery" : "Publish to Gallery"}
          </button>
        </section>

        <section className="pt-2" aria-label="Export section">
          <button
            onClick={onExport}
            className="w-full py-3 sm:py-3.5 text-sm sm:text-base font-medium text-gray-900 bg-corner-backstory hover:bg-corner-backstory/90 rounded-xl transition-colors shadow-sm hover:shadow-md"
            aria-label="Export fourcorners.js JSON metadata (Keyboard shortcut: Cmd+S)"
          >
            Export fourcorners.js JSON
          </button>
          <p
            className="text-center text-xs sm:text-sm text-gray-700 mt-3"
            aria-label="Keyboard shortcut"
          >
            <kbd className="px-1.5 py-0.5 bg-surface rounded text-gray-500 font-mono text-xs">
              Cmd
            </kbd>
            +
            <kbd className="px-1.5 py-0.5 bg-surface rounded text-gray-500 font-mono text-xs">
              S
            </kbd>
          </p>
        </section>

        <MetadataInspector initiallyExpanded={viewingSharedProject} />
      </div>

      {/* eslint-disable react-hooks/refs -- passing RefObjects as data props, not accessing .current */}
      <SectionProgress
        sections={[
          {
            id: "credit-ethics",
            label: "Authorship",
            color: "bg-corner-creativeCommons",
            ref: sectionRefs["credit-ethics"],
            isPopulated: Boolean(
              creativeCommons.copyright ||
              creativeCommons.description ||
              photographerInfo?.bio ||
              photographerInfo?.contact ||
              photographerInfo?.website,
            ),
          },
          {
            id: "backstory",
            label: "Backstory",
            color: "bg-corner-backstory",
            ref: sectionRefs["backstory"],
            isPopulated: Boolean(backStory.text),
          },
          {
            id: "context-images",
            label: "Related Imagery",
            color: "bg-corner-context",
            ref: sectionRefs["context-images"],
            isPopulated: context.length > 0,
          },
          {
            id: "links",
            label: "Links",
            color: "bg-corner-links",
            ref: sectionRefs["links"],
            isPopulated: links.length > 0,
          },
        ]}
      />
      {/* eslint-enable react-hooks/refs */}

      <ScrollToTop />
    </>
  );
}
