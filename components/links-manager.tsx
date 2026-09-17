"use client";

import { useFourCornersStore } from "@/lib/store";
import { SectionHeader } from "@/components/section-header";
import { useState } from "react";

export function LinksManager() {
  const { links, mode, selectedCorners, addLink, removeLink } =
    useFourCornersStore();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchUrls, setBatchUrls] = useState("");

  // Hide in minimal mode if not selected
  if (mode === "minimal" && !selectedCorners.links) return null;

  const handleAddLink = () => {
    if (!url.trim()) return;
    addLink({ title: title.trim() || url.trim(), url: url.trim(), source: "" });
    setTitle("");
    setUrl("");
  };

  const handleBatchAdd = () => {
    const urls = batchUrls
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    urls.forEach((url) => {
      addLink({ title: url, url, source: "" });
    });

    setBatchUrls("");
    setBatchMode(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddLink();
    }
  };

  return (
    <section className="mb-4 sm:mb-6">
      <SectionHeader
        title="Links"
        color="corner-links"
        cornerLabel="links · upper-right"
        tooltipTitle="Links (Upper Right)"
        tooltipContent="Here one puts links to other websites that explain more about what is going on. For example, one can put links to Wikipedia, news articles, or to the photographer's homepage which contains a larger body of work on the same subject."
      />

      <div className="bg-surface rounded-none sm:rounded-xl -mx-4 sm:mx-0 border border-border border-l-[5px] border-l-corner-links p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">
            {batchMode ? "Batch Mode" : "Single Link"}
          </span>
          <button
            onClick={() => setBatchMode(!batchMode)}
            className="text-xs text-corner-links hover:text-corner-links/80 transition-colors"
          >
            {batchMode ? "← Single" : "Batch →"}
          </button>
        </div>

        {batchMode ? (
          <div className="space-y-2">
            <textarea
              value={batchUrls}
              onChange={(e) => setBatchUrls(e.target.value)}
              className="w-full bg-surface-alt rounded-lg px-3 py-2 text-sm text-gray-200 border border-border/50 focus:border-corner-links/50 focus:outline-none resize-none"
              placeholder="Paste multiple URLs (one per line)&#10;https://example.com/article1&#10;https://example.com/article2&#10;https://example.com/article3"
              rows={5}
            />
            <button
              onClick={handleBatchAdd}
              disabled={!batchUrls.trim()}
              className="w-full px-4 py-2 text-sm bg-corner-links/20 text-corner-links rounded-lg hover:bg-corner-links/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              + Add All Links
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <input
                  type="text"
                  aria-label="Link title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="w-full sm:w-1/3 bg-surface-alt rounded-lg px-3 py-2 text-sm text-gray-200 border border-border/50 focus:border-corner-links/50 focus:outline-none"
                  placeholder="Title (optional)"
                />
                <input
                  type="url"
                  aria-label="Link URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="flex-1 bg-surface-alt rounded-lg px-3 py-2 text-sm text-gray-200 border border-border/50 focus:border-corner-links/50 focus:outline-none"
                  placeholder="https://..."
                />
              </div>
              <button
                onClick={handleAddLink}
                disabled={!url.trim()}
                className="w-full sm:w-auto px-4 text-sm bg-corner-links/20 text-corner-links rounded-lg hover:bg-corner-links/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium h-[38px]"
              >
                + Add
              </button>
            </div>
          </>
        )}
        <div className="mt-3 space-y-2">
          {links.length > 0 ? (
            links.map((link, i) => (
              <div
                key={i}
                className="flex items-start gap-2 p-2 rounded-lg bg-surface-alt border border-border/30 group hover:border-corner-links/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-300 truncate">
                    {link.title}
                  </div>
                  <div className="text-[11px] text-gray-600 truncate">
                    {link.url}
                  </div>
                </div>
                <button
                  onClick={() => removeLink(i)}
                  className="flex-shrink-0 text-gray-600 hover:text-orange-500 transition-colors p-1"
                  title="Remove link"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-600 py-2 text-center">
              No links added yet
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
