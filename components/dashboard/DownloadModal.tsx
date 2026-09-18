"use client";

import { useEffect, useState } from "react";
import {
  notify,
  notifyClipboard,
} from "@/lib/notify";
import {
  downloadFourCornersJSON,
  downloadIIIFManifest,
  copyFourCornersJSON,
  copyIIIFManifest,
} from "@/lib/metadata-export";
import { getProject } from "@/lib/api-client/project-actions";
import type { ProjectRecord } from "@/lib/projects/types";
import { normalizeFromProjectRecord } from "@/lib/export/normalize";
import type { ExportFormat, ExportResult } from "@/lib/export/types";
import { useExportEngine } from "@/hooks/useExportEngine";
import { formatBytes } from "@/lib/upload-limits";
import {
  X,
  Download,
  Copy,
  FileJson,
  FileCode,
  FileArchive,
  FileText,
  Check,
} from "lucide-react";

export function DownloadModal({
  project,
  onClose,
}: {
  project: ProjectRecord;
  onClose: () => void;
}) {
  const [jsonCopied, setJsonCopied] = useState(false);
  const [iiifCopied, setIiifCopied] = useState(false);
  const [fullProject, setFullProject] = useState<ProjectRecord | null>(null);
  const [embedImages, setEmbedImages] = useState(true);
  const [excludeLocation, setExcludeLocation] = useState(false);
  const [includeExif, setIncludeExif] = useState(true);
  const engine = useExportEngine();

  // List rows carry partial metadata — fetch the normalized-table
  // reconstruction once so exports cover the full project.
  useEffect(() => {
    let stale = false;
    getProject(project.id)
      .then((full) => {
        if (!stale) setFullProject(full);
      })
      .catch(() => {
        if (!stale) setFullProject(project);
      });
    return () => {
      stale = true;
    };
  }, [project]);

  const downloadResult = (result: ExportResult) => {
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runEngineExport = async (format: ExportFormat) => {
    const source = fullProject ?? project;
    const result = await engine.start(normalizeFromProjectRecord(source), {
      format,
      embedImages,
      excludeLocation,
      includeExif,
      includeConsentDocs: true,
      includeStandaloneInZip: true,
    });
    if (result) {
      downloadResult(result);
      notify.success(
        format === "zip" ? "ZIP bundle downloaded" : "Standalone HTML downloaded"
      );
    } else if (engine.status === "error") {
      notify.error("Export failed");
    }
  };

  const handleDownloadJSON = async () => {
    await downloadFourCornersJSON(fullProject ?? project);
    notify.success("Four Corners JSON downloaded");
  };

  const handleDownloadIIIF = () => {
    downloadIIIFManifest(fullProject ?? project);
    notify.success("IIIF manifest downloaded");
  };

  const handleCopyJSON = async () => {
    const success = await copyFourCornersJSON(fullProject ?? project);
    if (success) {
      setJsonCopied(true);
      notifyClipboard.copied();
      setTimeout(() => setJsonCopied(false), 2000);
    } else {
      notifyClipboard.failed();
    }
  };

  const handleCopyIIIF = async () => {
    const success = await copyIIIFManifest(fullProject ?? project);
    if (success) {
      setIiifCopied(true);
      notifyClipboard.copied();
      setTimeout(() => setIiifCopied(false), 2000);
    } else {
      notifyClipboard.failed();
    }
  };

  const exporting = engine.status === "running";
  const summary = engine.result?.summary ?? null;

  const toggles: Array<{
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }> = [
    { label: "Embed uploaded media", checked: embedImages, onChange: setEmbedImages },
    { label: "Exclude location", checked: excludeLocation, onChange: setExcludeLocation },
    { label: "Include camera EXIF", checked: includeExif, onChange: setIncludeExif },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 flex items-center justify-center">
        <div className="bg-surface border border-border rounded-xl shadow-2xl p-5 sm:p-6 w-full sm:w-[28rem] max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-200">
              Download Metadata
            </h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Export toggles — same semantics as the editor */}
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
            {toggles.map((toggle) => (
              <label
                key={toggle.label}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={toggle.checked}
                  onChange={(e) => toggle.onChange(e.target.checked)}
                  className="w-4 h-4 rounded bg-surface-alt border-border text-corner-context focus:ring-corner-context/30"
                />
                <span className="text-xs text-gray-400 leading-none">
                  {toggle.label}
                </span>
              </label>
            ))}
          </div>

          {/* Progress */}
          {exporting && (
            <div className="mb-4 p-3 bg-surface-alt border border-border rounded-lg">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-400 flex-1">
                  {engine.progress?.message || "Exporting…"}
                </p>
                <button
                  onClick={engine.cancel}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-gray-300 rounded"
                >
                  Cancel
                </button>
              </div>
              <div className="mt-2 h-1 bg-surface rounded overflow-hidden">
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
          )}

          {/* Last export summary */}
          {!exporting && summary && (
            <div className="mb-4 p-3 bg-surface-alt border border-border rounded-lg">
              <p className="text-xs text-gray-400">
                Exported {summary.assets.filter((a) => a.status === "resolved").length}{" "}
                assets ({formatBytes(summary.totalBytes)})
              </p>
              {summary.warnings.map((warning, i) => (
                <p key={i} className="mt-1 text-[11px] text-orange-400">
                  ⚠️ {warning}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {/* ZIP Bundle */}
            <div className="p-4 bg-surface-alt border border-border rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-corner-backstory/20 flex items-center justify-center">
                  <FileArchive size={20} className="text-corner-backstory" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-200">
                    ZIP Bundle (full project)
                  </h4>
                  <p className="text-xs text-gray-500">
                    All media, audio, and docs — reimports 1:1
                  </p>
                </div>
              </div>
              <button
                onClick={() => runEngineExport("zip")}
                disabled={exporting}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-corner-backstory/10 hover:bg-corner-backstory/20 border border-corner-backstory/30 rounded-lg text-sm text-corner-backstory transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                <span>{exporting ? "Exporting…" : "Download"}</span>
              </button>
            </div>

            {/* Standalone HTML */}
            <div className="p-4 bg-surface-alt border border-border rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-corner-links/20 flex items-center justify-center">
                  <FileText size={20} className="text-corner-links" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-200">
                    Standalone HTML
                  </h4>
                  <p className="text-xs text-gray-500">
                    Single offline viewer file, media embedded
                  </p>
                </div>
              </div>
              <button
                onClick={() => runEngineExport("html-standalone")}
                disabled={exporting}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-corner-links/10 hover:bg-corner-links/20 border border-corner-links/30 rounded-lg text-sm text-corner-links transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                <span>{exporting ? "Exporting…" : "Download"}</span>
              </button>
            </div>

            {/* Four Corners JSON */}
            <div className="p-4 bg-surface-alt border border-border rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-corner-backstory/20 flex items-center justify-center">
                  <FileJson size={20} className="text-corner-backstory" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-200">
                    Four Corners JSON
                  </h4>
                  <p className="text-xs text-gray-500">
                    Full metadata in FC format
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadJSON}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-corner-backstory/10 hover:bg-corner-backstory/20 border border-corner-backstory/30 rounded-lg text-sm text-corner-backstory transition-colors"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
                <button
                  onClick={handleCopyJSON}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    jsonCopied
                      ? "bg-green-500/20 text-green-400 border border-green-500/50"
                      : "bg-surface hover:bg-surface-alt border border-border text-gray-400"
                  }`}
                >
                  {jsonCopied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* IIIF Manifest */}
            <div className="p-4 bg-surface-alt border border-border rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-corner-context/20 flex items-center justify-center">
                  <FileCode size={20} className="text-corner-context" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-200">
                    IIIF Manifest
                  </h4>
                  <p className="text-xs text-gray-500">
                    Presentation API 3.0 format
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadIIIF}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-corner-context/10 hover:bg-corner-context/20 border border-corner-context/30 rounded-lg text-sm text-corner-context transition-colors"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
                <button
                  onClick={handleCopyIIIF}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    iiifCopied
                      ? "bg-green-500/20 text-green-400 border border-green-500/50"
                      : "bg-surface hover:bg-surface-alt border border-border text-gray-400"
                  }`}
                >
                  {iiifCopied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-600 text-center">
            ZIP bundles and standalone HTML reimport into the editor 1:1
          </p>
        </div>
      </div>
    </>
  );
}
