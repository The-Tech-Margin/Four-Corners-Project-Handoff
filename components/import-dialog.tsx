"use client";

import { useState, useRef } from "react";
import { useFourCornersStore } from "@/lib/store";
import Modal from "@/components/modal";
import {
  parseMetadataJson,
  parseMetadataText,
  validateImportFile,
  processEmbeddedContextImages,
  regenerateImportedIds,
  type ImportResult,
} from "@/lib/importMetadata";
import { importZipFile, type ZipImportResult } from "@/lib/importZip";
import { extractMetadataFromHtml } from "@/lib/importHtml";

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportDialog({ isOpen, onClose }: ImportDialogProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [processingStep, setProcessingStep] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMetadata = useFourCornersStore((state) => state.importMetadata);
  const setImageSrc = useFourCornersStore((state) => state.setImageSrc);
  const addConsentDocument = useFourCornersStore(
    (state) => state.addConsentDocument
  );
  const markUnsaved = useFourCornersStore((state) => state.markUnsaved);

  // Blobs are staged BEFORE any store mutation so autosave can never fire
  // against metadata whose media hasn't landed in IndexedDB yet.
  const parseByExtension = async (file: File): Promise<ZipImportResult> => {
    const name = file.name.toLowerCase();

    if (name.endsWith(".zip")) {
      setProcessingStep("Extracting bundle...");
      return importZipFile(file);
    }

    if (name.endsWith(".html")) {
      setProcessingStep("Reading HTML export...");
      const extraction = extractMetadataFromHtml(await file.text());
      if (!extraction.metadataText) {
        return {
          success: false,
          error: "No Four Corners metadata found in this HTML file",
        };
      }
      const result = parseMetadataText(extraction.metadataText);
      return { ...result, mainImage: result.mainImage || extraction.mainImage };
    }

    setProcessingStep("Parsing metadata...");
    return parseMetadataJson(file);
  };

  const handleFileSelect = async (file: File) => {
    setImportResult(null);
    setIsProcessing(true);
    setProcessingStep("Validating file...");

    try {
      // Validate file
      const validation = validateImportFile(file);
      if (!validation.valid) {
        setImportResult({
          success: false,
          error: validation.error,
        });
        setIsProcessing(false);
        return;
      }

      const result = await parseByExtension(file);

      if (!result.success || !result.data) {
        setImportResult(result);
        setIsProcessing(false);
        return;
      }

      // Fresh client ids — imported ids are the exporter's UUIDs and would
      // collide with the original rows' primary keys when a same-account
      // reimport saves (409 on context_items). Runs after ZIP staging, so
      // blobId/audioBlobId mappings are preserved by the spread.
      result.data = regenerateImportedIds(result.data);

      // Stage embedded base64 images into IndexedDB (JSON/HTML flavors; ZIP
      // media is already staged by importZipFile)
      if (result.data.context && result.data.context.length > 0) {
        setProcessingStep("Processing embedded images...");
        result.data.context = await processEmbeddedContextImages(
          result.data.context
        );
      }

      // All blobs staged — now mutate the store
      setProcessingStep("Loading metadata...");
      importMetadata(result.data);

      if (result.mainImage) {
        setImageSrc(result.mainImage);
      }

      for (const doc of result.consentDocuments ?? []) {
        addConsentDocument(doc);
      }

      // importMetadata never sets the dirty flag — without this, imported
      // projects skip autosave until the first manual edit.
      markUnsaved();

      setImportResult(result);
      setIsProcessing(false);

      // Auto-close on success after showing message. handleClose (not bare
      // onClose) so the result state resets — otherwise reopening the dialog
      // shows the previous run's result instead of the drop zone.
      if (result.success) {
        setTimeout(() => {
          handleClose();
        }, 2000);
      }
    } catch (error) {
      setImportResult({
        success: false,
        error: "Unexpected error: " + (error as Error).message,
      });
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleClose = () => {
    setImportResult(null);
    setProcessingStep("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Metadata"
      maxWidth="lg"
    >
      <div className="p-4 sm:p-6">
        {/* File Drop Zone */}
        {!isProcessing && !importResult && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              isDragging
                ? "border-corner-backstory bg-corner-backstory/5"
                : "border-border hover:border-border-hover"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.zip,.html"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-300 mb-1">
                  Drop an exported file here
                </p>
                <p className="text-xs text-gray-600">
                  or{" "}
                  <button
                    onClick={handleBrowseClick}
                    className="text-corner-backstory hover:underline"
                  >
                    browse files
                  </button>
                </p>
              </div>
              <div className="modal-text-muted text-xs space-y-1">
                <p>Supports:</p>
                <ul className="list-disc list-inside">
                  <li>.zip bundles (full project: media, audio, documents)</li>
                  <li>.json files (metadata, with or without embedded media)</li>
                  <li>.html exports (standalone viewer or embed snippet)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-12 h-12 border-4 border-corner-backstory border-t-transparent rounded-full animate-spin"></div>
            <div className="text-center">
              <p className="text-sm text-gray-300 mb-1">Processing...</p>
              <p className="text-xs text-gray-600">{processingStep}</p>
            </div>
          </div>
        )}

        {/* Result State */}
        {importResult && !isProcessing && (
          <div className="space-y-4">
            {importResult.success ? (
              <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <svg
                  className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-400 mb-1">
                    Import Successful
                  </p>
                  <p className="text-xs text-green-300/70">
                    Metadata has been loaded into the editor
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <svg
                  className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-400 mb-1">
                    Import Failed
                  </p>
                  <p className="text-xs text-red-300/70">
                    {importResult.error}
                  </p>
                </div>
              </div>
            )}

            {/* Warnings */}
            {importResult.warnings && importResult.warnings.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-400">Warnings:</p>
                {importResult.warnings.map((warning, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg"
                  >
                    <svg
                      className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-xs text-orange-300/90">{warning}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {importResult.success ? (
                <button
                  onClick={handleClose}
                  className="modal-button-secondary flex-1 py-2 text-sm font-medium rounded-lg transition-colors"
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setImportResult(null);
                      fileInputRef.current?.click();
                    }}
                    className="modal-button-primary flex-1 py-2 text-sm font-medium rounded-lg transition-colors"
                  >
                    Try Another File
                  </button>
                  <button
                    onClick={handleClose}
                    className="modal-button-secondary flex-1 py-2 text-sm font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Help Text */}
        {!isProcessing && !importResult && (
          <div className="mt-4 p-3 bg-surface-alt/30 rounded-lg border border-border/30">
            <p className="modal-text-muted text-xs mb-2">
              <strong className="modal-text">What happens on import:</strong>
            </p>
            <ul className="modal-text-muted text-xs space-y-1 list-disc list-inside">
              <li>Metadata fields will replace current values</li>
              <li>Embedded images will be stored locally</li>
              <li>External URLs will be preserved as references</li>
              <li>Current image preview will not be replaced</li>
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
