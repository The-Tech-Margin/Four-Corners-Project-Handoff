"use client";

import { useFourCornersStore } from "@/lib/store";
import { toFourCornersSchema } from "@/lib/schema";
import { generateHtmlExport } from "@/lib/exportHtml";
import {
  normalizeFromStoreState,
  optionsFromEditorState,
} from "@/lib/export/normalize";
import type { ExportFormat, ExportResult } from "@/lib/export/types";
import { useExportEngine } from "@/hooks/useExportEngine";
import { formatBytes } from "@/lib/upload-limits";
import { useState, useEffect, useMemo } from "react";
import { notifyExport } from "@/lib/notify";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const backStory = useFourCornersStore((state) => state.backStory);
  const context = useFourCornersStore((state) => state.context);
  const links = useFourCornersStore((state) => state.links);
  const creativeCommons = useFourCornersStore((state) => state.creativeCommons);
  const ethics = useFourCornersStore((state) => state.ethics);
  const location = useFourCornersStore((state) => state.location);
  const excludeLocationFromExport = useFourCornersStore(
    (state) => state.excludeLocationFromExport
  );
  const includeExifInExport = useFourCornersStore(
    (state) => state.includeExifInExport
  );
  const photoMetadata = useFourCornersStore((state) => state.photoMetadata);
  const voiceTranscriptions = useFourCornersStore(
    (state) => state.voiceTranscriptions
  );
  const meta = useFourCornersStore((state) => state.meta);
  const photographerInfo = useFourCornersStore(
    (state) => state.photographerInfo
  );

  const imageSrc = useFourCornersStore((state) => state.imageSrc);
  const { copied: jsonCopied, copy: copyJson } = useCopyToClipboard();
  const { copied: htmlCopied, copy: copyHtml } = useCopyToClipboard();
  const { copied: allCopied, copy: copyAll } = useCopyToClipboard();
  const [jsonExpanded, setJsonExpanded] = useState(true);
  const [htmlExpanded, setHtmlExpanded] = useState(true);
  const [embedImages, setEmbedImages] = useState(true);
  const [htmlMode, setHtmlMode] = useState<"snippet" | "standalone" | "zip">(
    "zip"
  );
  const engine = useExportEngine();

  // Lightweight preview: serialize output WITHOUT binary embedding. Binary
  // work happens only at download time, in the worker.
  const jsonOutput = useMemo(() => {
    try {
      const data = toFourCornersSchema(
        {
          backStory,
          context,
          links,
          creativeCommons,
          ethics,
          photographerInfo,
          location: excludeLocationFromExport ? undefined : location,
          photoMetadata: includeExifInExport ? photoMetadata : undefined,
          voiceTranscriptions,
          meta,
        },
        undefined,
        excludeLocationFromExport
      );
      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error("Export preview failed:", error);
      return "";
    }
  }, [
    backStory,
    context,
    links,
    creativeCommons,
    ethics,
    photographerInfo,
    location,
    excludeLocationFromExport,
    includeExifInExport,
    photoMetadata,
    voiceTranscriptions,
    meta,
  ]);

  const embedOutput = useMemo(
    () =>
      `<script data-4c-meta="image.jpg" type="text/json">\n${jsonOutput}\n</script>`,
    [jsonOutput]
  );

  const htmlOutput = useMemo(() => {
    if (htmlMode !== "snippet") return "";
    try {
      return generateHtmlExport(
        {
          backStory,
          context,
          links,
          creativeCommons,
          ethics,
          photographerInfo,
          location: excludeLocationFromExport ? undefined : location,
          photoMetadata: includeExifInExport ? photoMetadata : undefined,
          voiceTranscriptions,
          meta,
        },
        imageSrc || "[YOUR_IMAGE_URL]",
        {
          mode: "snippet",
          imageSource: imageSrc ? "embed" : "url",
          includeRawMetadata: true,
        }
      );
    } catch (error) {
      console.error("Snippet preview failed:", error);
      return "";
    }
  }, [
    htmlMode,
    imageSrc,
    backStory,
    context,
    links,
    creativeCommons,
    ethics,
    photographerInfo,
    location,
    excludeLocationFromExport,
    includeExifInExport,
    photoMetadata,
    voiceTranscriptions,
    meta,
  ]);

  const downloadResult = (result: ExportResult) => {
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runEngineExport = async (format: ExportFormat) => {
    const state = useFourCornersStore.getState();
    const input = normalizeFromStoreState(state);
    const options = optionsFromEditorState(state, format, embedImages);
    const result = await engine.start(input, options);
    if (result) {
      downloadResult(result);
    } else if (engine.status === "error") {
      notifyExport.failed();
    }
    return result;
  };

  const handleCopyJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyJson(jsonOutput);
  };

  const getExportSize = () => {
    const sizeInBytes = new Blob([jsonOutput]).size;
    return formatBytes(sizeInBytes);
  };

  const uploadedCount = context.filter(
    (item) => item.sourceType === "upload"
  ).length;

  const handleCopyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const combined = `JSON:\n${jsonOutput}\n\nHTML Embed:\n${embedOutput}`;
    copyAll(combined);
  };

  const handleDownloadJson = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await runEngineExport("json");
  };

  const handleCopyHtml = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyHtml(htmlOutput);
  };

  const handleDownloadHtml = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await runEngineExport(
      htmlMode === "snippet" ? "html-snippet" : "html-standalone"
    );
  };

  const handleDownloadZip = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await runEngineExport("zip");
  };

  const handleDownloadAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const jsonBlob = new Blob([jsonOutput], { type: "application/json" });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement("a");
    jsonLink.href = jsonUrl;
    jsonLink.download = "four-corners.json";
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);

    setTimeout(() => {
      const htmlBlob = new Blob([embedOutput], { type: "text/html" });
      const htmlUrl = URL.createObjectURL(htmlBlob);
      const htmlLink = document.createElement("a");
      htmlLink.href = htmlUrl;
      htmlLink.download = "four-corners-embed.html";
      htmlLink.click();
      URL.revokeObjectURL(htmlUrl);
    }, 100);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const exporting = engine.status === "running";
  const summary = engine.result?.summary ?? null;
  const resolvedAssets = summary
    ? summary.assets.filter((a) => a.status === "resolved")
    : [];

  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
    >
      <div
        className="bg-surface rounded-xl sm:rounded-2xl w-full max-w-2xl border border-border overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-border">
          <h2
            id="export-dialog-title"
            className="text-lg font-medium text-gray-200"
          >
            Export Metadata
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-alt transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
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

        {/* Export Options */}
        {uploadedCount > 0 && (
          <div className="px-4 sm:px-5 py-3 bg-surface-alt/20 border-b border-border/30">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={embedImages}
                onChange={(e) => setEmbedImages(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded bg-surface-alt border-border text-corner-context focus:ring-corner-context/30"
              />
              <div className="flex-1">
                <span className="text-sm text-gray-300 group-hover:text-gray-200">
                  Embed uploaded media ({uploadedCount})
                </span>
                <p className="text-xs text-gray-600 mt-0.5">
                  {embedImages
                    ? "Media is converted to base64 at download time"
                    : "Export references only (URLs)"}
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Export progress */}
        {exporting && (
          <div className="px-4 sm:px-5 py-3 bg-surface-alt/20 border-b border-border/30">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-xs text-gray-400">
                  {engine.progress?.message || "Exporting…"}
                </p>
                <div className="mt-1.5 h-1 bg-surface-alt rounded overflow-hidden">
                  <div
                    className="h-full bg-corner-backstory transition-all"
                    style={{
                      width:
                        engine.progress?.total && engine.progress.current
                          ? `${Math.round((engine.progress.current / engine.progress.total) * 100)}%`
                          : "40%",
                    }}
                  />
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  engine.cancel();
                }}
                className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-surface-alt/50 rounded transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Last export summary */}
        {!exporting && summary && (
          <div className="px-4 sm:px-5 py-3 bg-surface-alt/20 border-b border-border/30">
            <p className="text-xs text-gray-400">
              Last export: {resolvedAssets.length}{" "}
              {resolvedAssets.length === 1 ? "asset" : "assets"} (
              {formatBytes(summary.totalBytes)})
            </p>
            {summary.warnings.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {summary.warnings.map((warning, i) => (
                  <li key={i} className="text-[11px] text-orange-400">
                    ⚠️ {warning}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Batch Actions */}
        <div className="flex gap-1.5 px-4 sm:px-5 py-2.5 bg-surface-alt/20 border-b border-border/30">
          <button
            onClick={handleCopyAll}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1 ${
              allCopied
                ? "bg-corner-context/15 text-corner-context"
                : "text-gray-400 hover:text-gray-300 hover:bg-surface-alt/50"
            }`}
          >
            {allCopied ? (
              <>
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Copied
              </>
            ) : (
              <>
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
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy All
              </>
            )}
          </button>
          <button
            onClick={handleDownloadAll}
            className="flex-1 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-surface-alt/50 rounded transition-all flex items-center justify-center gap-1"
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
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download All
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1">
          {/* JSON Section */}
          <div className="border-b border-border">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setJsonExpanded(!jsonExpanded);
              }}
              className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-surface-alt/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform ${
                    jsonExpanded ? "rotate-90" : ""
                  }`}
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
                <h4 className="text-sm font-medium text-gray-300">
                  JSON Output
                </h4>
              </div>
              <span className="text-xs text-gray-600">
                Preview · {getExportSize()} without media
              </span>
            </button>
            {jsonExpanded && (
              <div className="px-4 sm:px-5 pb-4">
                <div className="relative">
                  <pre className="p-3 sm:p-4 text-xs text-gray-200 bg-bg rounded-lg overflow-auto max-h-64 font-mono border border-border/50">
                    {jsonOutput}
                  </pre>
                </div>
                <div className="flex gap-1.5 mt-2.5">
                  <button
                    onClick={handleCopyJson}
                    className={`flex-1 sm:flex-none sm:px-3 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
                      jsonCopied
                        ? "bg-corner-context/15 text-corner-context"
                        : "text-gray-400 hover:text-gray-300 hover:bg-surface-alt/50"
                    }`}
                  >
                    {jsonCopied ? (
                      <>
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
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
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownloadJson}
                    disabled={exporting}
                    className="flex-1 sm:flex-none sm:px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-surface-alt/50 rounded transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download
                  </button>
                </div>
                {embedImages && uploadedCount > 0 && (
                  <p className="text-[10px] text-gray-600 mt-1.5">
                    Downloaded JSON embeds all media as base64 — built in the
                    background.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Interactive HTML Export Section */}
          <div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHtmlExpanded(!htmlExpanded);
              }}
              className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-surface-alt/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform ${
                    htmlExpanded ? "rotate-90" : ""
                  }`}
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
                <h4 className="text-sm font-medium text-gray-300">
                  Interactive HTML Export
                </h4>
              </div>
              <span className="text-xs text-gray-600">
                {htmlMode === "zip"
                  ? "Complete bundle (full project)"
                  : htmlMode === "snippet"
                  ? "Embed snippet"
                  : "Standalone file"}
              </span>
            </button>
            {htmlExpanded && (
              <div className="px-4 sm:px-5 pb-4 space-y-3">
                {/* Export Mode Selection */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Export Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHtmlMode("zip");
                      }}
                      className={`py-2 px-2 text-xs rounded transition-all ${
                        htmlMode === "zip"
                          ? "bg-corner-backstory/20 text-corner-backstory border border-corner-backstory/30"
                          : "bg-surface-alt/50 text-gray-400 hover:text-gray-300"
                      }`}
                    >
                      <div className="font-medium">ZIP Bundle</div>
                      <div className="text-[9px] opacity-70 mt-0.5">
                        Recommended
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHtmlMode("snippet");
                      }}
                      className={`py-2 px-2 text-xs rounded transition-all ${
                        htmlMode === "snippet"
                          ? "bg-corner-backstory/20 text-corner-backstory border border-corner-backstory/30"
                          : "bg-surface-alt/50 text-gray-400 hover:text-gray-300"
                      }`}
                    >
                      <div className="font-medium">Snippet</div>
                      <div className="text-[9px] opacity-70 mt-0.5">
                        Embed code
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHtmlMode("standalone");
                      }}
                      className={`py-2 px-2 text-xs rounded transition-all ${
                        htmlMode === "standalone"
                          ? "bg-corner-backstory/20 text-corner-backstory border border-corner-backstory/30"
                          : "bg-surface-alt/50 text-gray-400 hover:text-gray-300"
                      }`}
                    >
                      <div className="font-medium">Standalone</div>
                      <div className="text-[9px] opacity-70 mt-0.5">
                        Single file
                      </div>
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-600">
                    {htmlMode === "zip"
                      ? "Every field and file — media, audio, voice notes, consent docs — ready to publish or reimport 1:1"
                      : htmlMode === "snippet"
                      ? "Paste into existing webpage or CMS (requires fourcorners.js from CDN)"
                      : "Complete offline HTML file with all media embedded — also reimportable"}
                  </p>
                </div>

                {/* Preview - Only for snippet */}
                {htmlMode === "snippet" && (
                  <div className="relative">
                    <code className="block p-3 sm:p-4 bg-bg rounded-lg text-xs text-gray-200 overflow-auto max-h-64 whitespace-pre-wrap break-all font-mono border border-border/50">
                      {htmlOutput}
                    </code>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1.5">
                  {htmlMode === "zip" ? (
                    <button
                      onClick={handleDownloadZip}
                      disabled={exporting}
                      className="flex-1 py-2 text-xs font-medium bg-corner-backstory/20 text-corner-backstory hover:bg-corner-backstory/30 rounded transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {exporting ? (
                        <>
                          <svg
                            className="w-3 h-3 animate-spin"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                          Exporting…
                        </>
                      ) : (
                        <>
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
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          Download ZIP Bundle
                        </>
                      )}
                    </button>
                  ) : htmlMode === "snippet" ? (
                    <button
                      onClick={handleCopyHtml}
                      className={`flex-1 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
                        htmlCopied
                          ? "bg-corner-context/15 text-corner-context"
                          : "text-gray-400 hover:text-gray-300 hover:bg-surface-alt/50"
                      }`}
                    >
                      {htmlCopied ? (
                        <>
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
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
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
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                          Copy to Clipboard
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleDownloadHtml}
                      disabled={exporting}
                      className="flex-1 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-surface-alt/50 rounded transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      {exporting ? "Exporting…" : "Download HTML File"}
                    </button>
                  )}
                </div>

                {htmlMode === "snippet" && (
                  <p className="text-[10px] text-gray-600">
                    Requires fourcorners.js library (loaded from CDN).
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
