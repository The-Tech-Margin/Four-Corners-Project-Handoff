"use client";

import { useFourCornersStore } from "@/lib/store";
import { useState, useEffect, useRef } from "react";
import { isVideoUrl } from "@/lib/media-utils";

export function FourCornersPreview() {
  const imageSrc = useFourCornersStore((state) => state.imageSrc);
  const mode = useFourCornersStore((state) => state.mode);
  const selectedCorners = useFourCornersStore((state) => state.selectedCorners);
  const backStory = useFourCornersStore((state) => state.backStory);
  const context = useFourCornersStore((state) => state.context);
  const links = useFourCornersStore((state) => state.links);
  const creativeCommons = useFourCornersStore((state) => state.creativeCommons);
  const ethics = useFourCornersStore((state) => state.ethics);

  const [blobUrls, setBlobUrls] = useState<Record<number, string>>({});
  const blobUrlsRef = useRef(blobUrls);
  blobUrlsRef.current = blobUrls;

  // Load blob URLs from IndexedDB for uploaded images
  useEffect(() => {
    const loadBlobUrls = async () => {
      const { mediaStorage } = await import("@/lib/media-storage");
      const urls: Record<number, string> = {};

      for (let i = 0; i < context.length; i++) {
        const item = context[i];
        if (item.sourceType === "upload" && item.blobId !== undefined) {
          try {
            const mediaBlob = await mediaStorage.get(item.blobId);
            if (mediaBlob) {
              urls[i] = URL.createObjectURL(mediaBlob.blob);
            }
          } catch (error) {
            console.error("Failed to load blob for preview:", error);
          }
        }
      }

      setBlobUrls(urls);
    };

    if (context.length > 0) {
      loadBlobUrls();
    }

    // Cleanup blob URLs on unmount — use ref to avoid stale closure
    return () => {
      Object.values(blobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [context]);

  // Determine which corners have actual content
  const hasBackstory = Boolean(backStory.text);
  const hasContext = context.length > 0;
  const hasLinks = links.length > 0;
  const hasCredit = Boolean(
    creativeCommons.description || creativeCommons.copyright || ethics,
  );

  // Show corner only if it has content AND is selected (in minimal mode) or mode is not minimal
  const showBackstory =
    hasBackstory && (mode !== "minimal" || selectedCorners.backstory);
  const showContext =
    hasContext && (mode !== "minimal" || selectedCorners.relatedImagery);
  const showLinks = hasLinks && (mode !== "minimal" || selectedCorners.links);
  const showCredit = hasCredit; // Always show if has content

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
    <div className="mt-6 sm:mt-8 bg-surface/50 border border-border rounded-xl overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-border">
        <h2 className="text-base sm:text-lg font-medium text-gray-300">
          Four Corners Preview
        </h2>
      </div>

      <div className="p-4 sm:p-6">
        {/* Mobile: Stacked Layout */}
        <div className="lg:hidden space-y-4">
          <div className="bg-black rounded-lg overflow-hidden relative flex items-center justify-center min-h-[250px]">
            {isVideoUrl(imageSrc) ? (
              <video
                src={imageSrc || undefined}
                controls
                playsInline
                preload="metadata"
                className="max-w-full max-h-[300px] object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- preview panel
              <img
                src={imageSrc || undefined}
                alt={creativeCommons.description || "Preview image"}
                className="max-w-full max-h-[300px] object-contain"
              />
            )}
            {showContext && (
              <button
                className="absolute top-2 left-2 w-6 h-6 rounded-sm bg-corner-context shadow-lg hover:scale-110 transition-transform cursor-pointer group"
                title="Related Imagery - Click to view"
                onClick={() =>
                  document
                    .getElementById("preview-context")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                aria-label="View Related Imagery section"
              >
                <span className="absolute left-8 top-1/2 -translate-y-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 fc-focus-reveal transition-opacity pointer-events-none">
                  Related Imagery
                </span>
              </button>
            )}
            {showLinks && (
              <button
                className="absolute top-2 right-2 w-6 h-6 rounded-sm bg-corner-links shadow-lg hover:scale-110 transition-transform cursor-pointer group"
                title="Links - Click to view"
                onClick={() =>
                  document
                    .getElementById("preview-links")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                aria-label="View Links section"
              >
                <span className="absolute right-8 top-1/2 -translate-y-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 fc-focus-reveal transition-opacity pointer-events-none">
                  Links
                </span>
              </button>
            )}
            {showBackstory && (
              <button
                className="absolute bottom-2 left-2 w-6 h-6 rounded-sm bg-corner-backstory shadow-lg hover:scale-110 transition-transform cursor-pointer group"
                title="Backstory - Click to view"
                onClick={() =>
                  document
                    .getElementById("preview-backstory")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                aria-label="View Backstory section"
              >
                <span className="absolute left-8 top-1/2 -translate-y-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 fc-focus-reveal transition-opacity pointer-events-none">
                  Backstory
                </span>
              </button>
            )}
            {showCredit && (
              <button
                className="absolute bottom-2 right-2 w-6 h-6 rounded-sm bg-corner-creativeCommons shadow-lg hover:scale-110 transition-transform cursor-pointer group"
                title="Authorship - Click to view"
                onClick={() =>
                  document
                    .getElementById("preview-credit")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                aria-label="View Authorship section"
              >
                <span className="absolute right-8 top-1/2 -translate-y-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 fc-focus-reveal transition-opacity pointer-events-none">
                  Authorship
                </span>
              </button>
            )}
          </div>

          {showContext && (
            <div
              id="preview-context"
              className="bg-bg/80 border border-border/50 border-l-[5px] border-l-corner-context rounded-lg p-4 scroll-mt-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-sm bg-corner-context"></div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-corner-context">
                  Related Imagery
                </h3>
              </div>
              <div className="space-y-4">
                {context.map((item, index) => {
                  const src =
                    item.sourceType === "upload" && blobUrls[index]
                      ? blobUrls[index]
                      : item.url || item.src;

                  return (
                    <div key={index}>
                      {item.type === "video" ? (
                        <video
                          src={src}
                          controls
                          className="w-full rounded bg-black mb-2"
                        />
                      ) : (
                        <img
                          src={src}
                          alt={item.caption || "Context image"}
                          className="w-full rounded bg-black mb-2"
                        />
                      )}
                      {item.caption && (
                        <p className="text-xs text-gray-400 leading-relaxed">
                          {item.caption}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showBackstory && (
            <div
              id="preview-backstory"
              className="bg-bg/80 border border-border/50 border-l-[5px] border-l-corner-backstory rounded-lg p-4 scroll-mt-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-sm bg-corner-backstory"></div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-corner-backstory">
                  Backstory
                </h3>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-gray-300 leading-relaxed">
                  {backStory.text}
                </p>
                <div className="space-y-1 text-xs text-gray-500">
                  {backStory.author && (
                    <div>
                      <span className="font-medium text-gray-400">Author:</span>{" "}
                      {backStory.author}
                    </div>
                  )}
                  {backStory.publication && (
                    <div>
                      <span className="font-medium text-gray-400">
                        Publication:
                      </span>{" "}
                      {backStory.publication}
                    </div>
                  )}
                  {backStory.date && (
                    <div>
                      <span className="font-medium text-gray-400">Date:</span>{" "}
                      {backStory.date}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {showLinks && (
            <div
              id="preview-links"
              className="bg-bg/80 border border-border/50 border-l-[5px] border-l-corner-links rounded-lg p-4 scroll-mt-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-sm bg-corner-links"></div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-corner-links">
                  Links
                </h3>
              </div>
              <div className="space-y-3">
                {links.map((link, index) => (
                  <div
                    key={index}
                    className={
                      index < links.length - 1
                        ? "pb-3 border-b border-border/30"
                        : ""
                    }
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent hover:underline font-medium block mb-1"
                    >
                      {link.title}
                    </a>
                    {link.source && (
                      <p className="text-xs text-gray-500">{link.source}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showCredit && (
            <div
              id="preview-credit"
              className="bg-bg/80 border border-border/50 border-l-[5px] border-l-corner-creativeCommons rounded-lg p-4 scroll-mt-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-sm bg-corner-creativeCommons"></div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-corner-creativeCommons">
                  Authorship
                </h3>
              </div>
              <div className="space-y-3">
                {creativeCommons.description && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-400 mb-1">
                      Caption
                    </h4>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {creativeCommons.description}
                    </p>
                  </div>
                )}
                {creativeCommons.copyright && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-400 mb-1">
                      Copyright
                    </h4>
                    <p className="text-sm text-gray-400">
                      {creativeCommons.copyright}
                    </p>
                  </div>
                )}
                {ethics && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-400 mb-2">
                      Code of Ethics
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            ethics.noManipulation
                              ? "bg-green-500"
                              : "bg-gray-600"
                          }`}
                        ></div>
                        <span className="text-xs text-gray-400">
                          No Manipulation
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            ethics.noStaging ? "bg-green-500" : "bg-gray-600"
                          }`}
                        ></div>
                        <span className="text-xs text-gray-400">
                          No Staging
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            ethics.informedConsent
                              ? "bg-green-500"
                              : "bg-gray-600"
                          }`}
                        ></div>
                        <span className="text-xs text-gray-400">
                          Informed Consent
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            ethics.identityProtected
                              ? "bg-green-500"
                              : "bg-gray-600"
                          }`}
                        ></div>
                        <span className="text-xs text-gray-400">
                          Identity Protected
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop: Four Corners Quadrant Layout */}
        <div className="hidden lg:block relative">
          <div
            className="grid grid-cols-2 gap-4"
            style={{ minHeight: "600px" }}
          >
            {showContext && (
              <div
                id="desktop-preview-context"
                className="bg-bg/80 border border-border/50 border-l-[5px] border-l-corner-context rounded-lg p-4 overflow-auto scroll-mt-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-sm bg-corner-context"></div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-corner-context">
                    Related Imagery
                  </h3>
                </div>
                <div className="space-y-4">
                  {context.map((item, index) => {
                    const src =
                      item.sourceType === "upload" && blobUrls[index]
                        ? blobUrls[index]
                        : item.url || item.src;

                    return (
                      <div key={index}>
                        {item.type === "video" ? (
                          <video
                            src={src}
                            controls
                            className="w-full rounded bg-black mb-2"
                          />
                        ) : (
                          <img
                            src={src}
                            alt={item.caption || "Context image"}
                            className="w-full rounded bg-black mb-2"
                          />
                        )}
                        {item.caption && (
                          <p className="text-xs text-gray-400 leading-relaxed">
                            {item.caption}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {showLinks && (
              <div
                id="desktop-preview-links"
                className="bg-bg/80 border border-border/50 border-l-[5px] border-l-corner-links rounded-lg p-4 overflow-auto scroll-mt-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-sm bg-corner-links"></div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-corner-links">
                    Links
                  </h3>
                </div>
                <div className="space-y-3">
                  {links.map((link, index) => (
                    <div
                      key={index}
                      className={
                        index < links.length - 1
                          ? "pb-3 border-b border-border/30"
                          : ""
                      }
                    >
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:underline font-medium block mb-1"
                      >
                        {link.title}
                      </a>
                      {link.source && (
                        <p className="text-xs text-gray-500">{link.source}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showBackstory && (
              <div
                id="desktop-preview-backstory"
                className="bg-bg/80 border border-border/50 border-l-[5px] border-l-corner-backstory rounded-lg p-4 overflow-auto scroll-mt-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-sm bg-corner-backstory"></div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-corner-backstory">
                    Backstory
                  </h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {backStory.text}
                  </p>
                  <div className="space-y-1 text-xs text-gray-500">
                    {backStory.author && (
                      <div>
                        <span className="font-medium text-gray-400">
                          Author:
                        </span>{" "}
                        {backStory.author}
                      </div>
                    )}
                    {backStory.publication && (
                      <div>
                        <span className="font-medium text-gray-400">
                          Publication:
                        </span>{" "}
                        {backStory.publication}
                      </div>
                    )}
                    {backStory.date && (
                      <div>
                        <span className="font-medium text-gray-400">Date:</span>{" "}
                        {backStory.date}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {showCredit && (
              <div
                id="desktop-preview-credit"
                className="bg-bg/80 border border-border/50 border-l-[5px] border-l-corner-creativeCommons rounded-lg p-4 overflow-auto scroll-mt-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-sm bg-corner-creativeCommons"></div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-corner-creativeCommons">
                    Authorship
                  </h3>
                </div>
                <div className="space-y-3">
                  {creativeCommons.description && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-400 mb-1">
                        Caption
                      </h4>
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {creativeCommons.description}
                      </p>
                    </div>
                  )}
                  {creativeCommons.copyright && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-400 mb-1">
                        Copyright
                      </h4>
                      <p className="text-sm text-gray-400">
                        {creativeCommons.copyright}
                      </p>
                    </div>
                  )}
                  {ethics && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-400 mb-2">
                        Code of Ethics
                      </h4>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              ethics.noManipulation
                                ? "bg-green-500"
                                : "bg-gray-600"
                            }`}
                          ></div>
                          <span className="text-xs text-gray-400">
                            No Manipulation
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              ethics.noStaging ? "bg-green-500" : "bg-gray-600"
                            }`}
                          ></div>
                          <span className="text-xs text-gray-400">
                            No Staging
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              ethics.informedConsent
                                ? "bg-green-500"
                                : "bg-gray-600"
                            }`}
                          ></div>
                          <span className="text-xs text-gray-400">
                            Informed Consent
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              ethics.identityProtected
                                ? "bg-green-500"
                                : "bg-gray-600"
                            }`}
                          ></div>
                          <span className="text-xs text-gray-400">
                            Identity Protected
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Centered Image Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black rounded-lg shadow-2xl relative max-w-md max-h-[500px] pointer-events-auto">
              {isVideoUrl(imageSrc) ? (
                <video
                  src={imageSrc || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-w-full max-h-[500px] object-contain rounded-lg"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- preview panel
                <img
                  src={imageSrc || undefined}
                  alt={creativeCommons.description || "Preview image"}
                  className="max-w-full max-h-[500px] object-contain rounded-lg"
                />
              )}
              {showContext && (
                <button
                  className="absolute top-2 left-2 w-5 h-5 rounded-sm bg-corner-context shadow-lg hover:scale-125 transition-transform cursor-pointer group"
                  title="Related Imagery"
                  onClick={() =>
                    document
                      .getElementById("desktop-preview-context")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  aria-label="View Related Imagery"
                >
                  <span className="absolute left-7 top-1/2 -translate-y-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    Related Imagery
                  </span>
                </button>
              )}
              {showLinks && (
                <button
                  className="absolute top-2 right-2 w-5 h-5 rounded-sm bg-corner-links shadow-lg hover:scale-125 transition-transform cursor-pointer group"
                  title="Links"
                  onClick={() =>
                    document
                      .getElementById("desktop-preview-links")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  aria-label="View Links"
                >
                  <span className="absolute right-7 top-1/2 -translate-y-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    Links
                  </span>
                </button>
              )}
              {showBackstory && (
                <button
                  className="absolute bottom-2 left-2 w-5 h-5 rounded-sm bg-corner-backstory shadow-lg hover:scale-125 transition-transform cursor-pointer group"
                  title="Backstory"
                  onClick={() =>
                    document
                      .getElementById("desktop-preview-backstory")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  aria-label="View Backstory"
                >
                  <span className="absolute left-7 top-1/2 -translate-y-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    Backstory
                  </span>
                </button>
              )}
              {showCredit && (
                <button
                  className="absolute bottom-2 right-2 w-5 h-5 rounded-sm bg-corner-creativeCommons shadow-lg hover:scale-125 transition-transform cursor-pointer group"
                  title="Authorship"
                  onClick={() =>
                    document
                      .getElementById("desktop-preview-credit")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  aria-label="View Authorship"
                >
                  <span className="absolute right-7 top-1/2 -translate-y-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    Authorship
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
