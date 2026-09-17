"use client";

import { useState, useRef, useCallback } from "react";
import { useAIGateway } from "@/hooks/use-ai-gateway";
import { useFourCornersStore } from "@/lib/store";
import { useAccess } from "@/components/access-provider";
import { notify, notifyFile } from "@/lib/notify";
import { isAudioMimeTypeSupported } from "@/lib/audio-utils";
import { Upload, FileAudio, X, Loader2, Library } from "lucide-react";
import { FCAudioPlayer } from "./viewer/fc-audio-player";
import { AssetLibraryModal } from "./asset-library-modal";
import type { UserAsset } from "@/lib/field-registry";
import { validateUpload, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/upload-limits";
import { checkQuotaForUpload } from "@/lib/api-client/quota";
import { mediaStorage } from "@/lib/media-storage";
import { useEagerAudioUpload } from "@/hooks/use-eager-audio-upload";

// Safe audio file types for upload
const ALLOWED_AUDIO_TYPES = [
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
] as const;

// File extensions for accept attribute
const ALLOWED_EXTENSIONS = ".mp3,.m4a,.mp4,.wav,.webm,.ogg";

interface AudioFileUploadProps {
  /** Callback when transcription is complete */
  onTranscriptionComplete?: (text: string) => void;
  /** Unique identifier for the field this upload belongs to */
  fieldId?: string;
  /** Compact mode - just icon button */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

export function AudioFileUpload({
  onTranscriptionComplete,
  fieldId,
  compact = false,
  className = "",
}: AudioFileUploadProps) {
  const { user } = useAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { eagerUploadTranscription } = useEagerAudioUpload();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: number;
    dataUrl: string;
    mimeType: string;
    duration?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isRetranscribing, setIsRetranscribing] = useState(false);

  const { transcribeAudio } = useAIGateway();
  const {
    addVoiceTranscription,
    voiceTranscriptions,
    setVoiceTranscriptions,
    markUnsaved,
  } = useFourCornersStore();

  /**
   * Validate file type only. Size is checked via the shared
   * validateUpload(file, 'audio') helper, which fires its own toast.
   */
  const validateFileType = useCallback((file: File): string | null => {
    const mimeType = file.type.toLowerCase();
    const isTypeValid =
      ALLOWED_AUDIO_TYPES.some((type) =>
        mimeType.includes(type.replace("audio/", "")),
      ) || isAudioMimeTypeSupported(mimeType);

    if (!isTypeValid) {
      return `Unsupported audio format: ${file.type || "unknown"}. Supported formats: MP3, M4A, WAV, WebM, OGG`;
    }
    return null;
  }, []);

  /**
   * Get audio duration from file
   */
  const getAudioDuration = useCallback((dataUrl: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        resolve(audio.duration * 1000); // Convert to ms
      };
      audio.onerror = () => {
        resolve(0); // Fallback if duration can't be determined
      };
      audio.src = dataUrl;
    });
  }, []);

  /**
   * Convert file to data URL
   */
  const fileToDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }, []);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Reset state
      setError(null);
      setUploadedFile(null);

      // Type check
      const typeError = validateFileType(file);
      if (typeError) {
        setError(typeError);
        notify.error(typeError);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      // Size check via shared limits module — fires toast + inline error.
      const sizeCheck = validateUpload(file, "audio");
      if (!sizeCheck.ok) {
        notifyFile.tooLarge(
          sizeCheck.fileName,
          sizeCheck.actualBytes,
          sizeCheck.limitBytes,
          sizeCheck.kind,
        );
        setError(sizeCheck.error);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      // Quota check — only meaningful once signed in.
      if (user) {
        const quota = await checkQuotaForUpload(file.size);
        if (!quota.ok) {
          notifyFile.quotaExceeded(quota.used, quota.limit, quota.plan);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      }

      setIsProcessing(true);

      try {
        // Convert to data URL
        const dataUrl = await fileToDataUrl(file);

        // Get duration
        const duration = await getAudioDuration(dataUrl);

        // Store file info
        setUploadedFile({
          name: file.name,
          size: file.size,
          dataUrl,
          mimeType: file.type,
          duration,
        });

        // Audio is saved untranscribed — the field's voice panel Transcribe
        // control drives transcription (deferred + opt-out).
        const transcribedText = "";

        // Persist the raw audio Blob to IDB (mediaStorage) so it survives
        // mobile tab-discard / browser refresh before the upload
        // completes. Cleared by useProjectSave after a successful upload.
        let audioBlobId: number | undefined;
        try {
          audioBlobId = await mediaStorage.save(file, file.name);
        } catch (e) {
          console.warn("[AudioFileUpload] mediaStorage.save failed:", e);
        }

        // Create voice transcription entry (untranscribed — the panel's
        // Transcribe control transcribes it later if the user keeps it checked).
        const recordingId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const transcriptionId = `transcript-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        addVoiceTranscription({
          id: transcriptionId,
          recordingId,
          text: transcribedText,
          transcribedAt: new Date().toISOString(),
          fieldId,
          audioDataUrl: dataUrl,
          audioBlobId,
          mimeType: file.type,
          duration,
        });

        // Save-on-attach: push the audio to storage now instead of letting it
        // pile up for the Save button (multiple pending clips used to fail).
        void eagerUploadTranscription(transcriptionId);

        notify.success("Audio added");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to process audio file";
        setError(errorMessage);
        notify.error(errorMessage);
        setUploadedFile(null);
      } finally {
        setIsProcessing(false);
        // Reset input for future uploads
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [
      validateFileType,
      fileToDataUrl,
      getAudioDuration,
      addVoiceTranscription,
      eagerUploadTranscription,
      fieldId,
    ]
  );

  /**
   * Clear uploaded file
   */
  const handleClear = useCallback(() => {
    setUploadedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  /**
   * Trigger file input click
   */
  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /**
   * Re-transcribe the currently-loaded audio. Useful primarily for
   * recordings imported from the library (their transcription is created
   * empty — see handleLibraryPick — and the user has no other way to
   * trigger Whisper). Also works for files just uploaded if the user
   * wants a fresh attempt.
   *
   * Whisper expects a base64 data URL. If the in-memory dataUrl is a
   * remote storage URL (library case), fetch it first and inline it.
   */
  const handleRetranscribe = useCallback(async () => {
    if (!uploadedFile) return;
    if (!fieldId) return;
    setIsRetranscribing(true);
    setError(null);
    try {
      let dataUrl = uploadedFile.dataUrl;
      if (!dataUrl.startsWith("data:")) {
        // Library-sourced — fetch the bytes and convert to a data URL.
        const res = await fetch(dataUrl);
        if (!res.ok) throw new Error(`Couldn't fetch audio (${res.status})`);
        const blob = await res.blob();
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error || new Error("Read failed"));
          reader.readAsDataURL(blob);
        });
      }
      const text = await transcribeAudio(dataUrl, uploadedFile.mimeType);

      // Update the matching voice transcription's text in place. Match by
      // fieldId (single recording per field for this component).
      const next = voiceTranscriptions.map((vt) =>
        vt.fieldId === fieldId
          ? { ...vt, text, transcribedAt: new Date().toISOString() }
          : vt,
      );
      setVoiceTranscriptions(next);
      // setVoiceTranscriptions doesn't flag the project dirty (it's also used
      // by load-time URL hydration), so mark unsaved here to trigger save.
      markUnsaved();
      onTranscriptionComplete?.(text);
      notify.success("Re-transcribed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Re-transcription failed";
      setError(msg);
      notify.error(msg);
    } finally {
      setIsRetranscribing(false);
    }
  }, [
    uploadedFile,
    fieldId,
    transcribeAudio,
    voiceTranscriptions,
    setVoiceTranscriptions,
    markUnsaved,
    onTranscriptionComplete,
  ]);

  /**
   * Handle picking an audio asset from the library.
   *
   * Library audio is already uploaded and available via signed URL. We add a
   * voice transcription entry that references the existing storage object so
   * uploadVoiceRecordings skips it (requires audioDataUrl && !audioStorageUrl).
   * Transcription text is left empty — the user can re-transcribe if needed.
   */
  const handleLibraryPick = useCallback(
    (assets: UserAsset[]) => {
      const picked = assets[0];
      if (!picked) return;
      const recordingId = `lib-${picked.id}`;

      // Saved untranscribed; the per-clip Transcribe modal (in the voice panel)
      // offers to reuse an existing transcription or run Whisper.
      const transcriptionId = `transcript-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      addVoiceTranscription({
        id: transcriptionId,
        recordingId,
        text: "",
        transcribedAt: new Date().toISOString(),
        fieldId,
        audioStoragePath: picked.storagePath,
        audioStorageUrl: picked.storageUrl,
        mimeType: picked.mimeType,
        duration: picked.duration ?? undefined,
      });

      // Already in storage — just persist the row in the background.
      void eagerUploadTranscription(transcriptionId);

      setUploadedFile({
        name: picked.fileName,
        size: picked.fileSize ?? 0,
        dataUrl: picked.storageUrl,
        mimeType: picked.mimeType,
        duration: picked.duration ?? undefined,
      });

      notify.success("Audio added from library");
    },
    [addVoiceTranscription, eagerUploadTranscription, fieldId],
  );

  // Compact mode - just an icon button
  if (compact) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Upload audio file"
        />
        <div className={`inline-flex items-center gap-0.5 ${className}`}>
          <button
            onClick={handleClick}
            disabled={isProcessing}
            className={`p-1.5 rounded-lg transition-colors ${
              isProcessing
                ? "text-gray-500 cursor-wait"
                : "text-gray-500 hover:text-accent hover:bg-accent/10"
            }`}
            title="Upload audio file for transcription"
            aria-label="Upload audio file"
          >
            {isProcessing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
          </button>
          <button
            onClick={() => setLibraryOpen(true)}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-gray-500 hover:text-accent hover:bg-accent/10 transition-colors disabled:cursor-wait"
            title="Pick from your library"
            aria-label="Pick audio from library"
          >
            <Library size={16} />
          </button>
        </div>
        <AssetLibraryModal
          isOpen={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onSelect={handleLibraryPick}
          multiSelect={false}
          allowedTypes={["audio"]}
          title="Pick audio from your library"
        />
      </>
    );
  }

  // Full mode with preview
  return (
    <div className={`space-y-2 ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload audio file"
      />

      {/* Upload button or file preview */}
      {!uploadedFile ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleClick}
            disabled={isProcessing}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed transition-colors ${
              isProcessing
                ? "border-gray-600 bg-gray-800/50 text-gray-500 cursor-wait"
                : "border-border/60 hover:border-accent/50 hover:bg-accent/5 text-gray-400 hover:text-accent"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Processing audio...</span>
              </>
            ) : (
              <>
                <Upload size={18} />
                <span className="text-sm">Upload audio file</span>
              </>
            )}
          </button>
          <button
            onClick={() => setLibraryOpen(true)}
            disabled={isProcessing}
            title="Browse your library"
            aria-label="Browse your library"
            className="w-12 h-12 sm:w-auto sm:h-auto sm:aspect-square flex items-center justify-center rounded-lg border border-border/60 hover:border-accent/50 hover:bg-accent/5 text-gray-400 hover:text-accent transition-colors disabled:cursor-wait"
          >
            <Library size={18} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-2 bg-surface-alt rounded-lg border border-border/40">
          <FileAudio size={18} className="text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 truncate">{uploadedFile.name}</p>
            <p className="text-xs text-gray-500">
              {formatFileSize(uploadedFile.size)}
              {uploadedFile.duration
                ? ` · ${(uploadedFile.duration / 1000).toFixed(1)}s`
                : ""}
            </p>
          </div>
          <div className="flex-1 max-w-[200px]">
            <FCAudioPlayer src={uploadedFile.dataUrl} duration={uploadedFile.duration ? uploadedFile.duration / 1000 : undefined} />
          </div>
          {/* Library-sourced audio is marked by handleLibraryPick using
              recordingId = `lib-${asset.id}`. That prefix persists via
              the recording_id column, so the checkbox stays available on
              reload even if the user didn't transcribe before saving. */}
          {fieldId &&
            voiceTranscriptions
              .find((vt) => vt.fieldId === fieldId)
              ?.recordingId?.startsWith("lib-") && (
            <label
              className="flex items-center gap-1.5 text-xs cursor-pointer select-none whitespace-nowrap"
              style={{ color: "var(--fc-text-muted)" }}
              title="Run Whisper on this clip and replace the transcript text"
            >
              <input
                type="checkbox"
                checked={isRetranscribing}
                disabled={isRetranscribing}
                onChange={(e) => {
                  if (e.target.checked && !isRetranscribing) handleRetranscribe();
                }}
                style={{ accentColor: "var(--fc-accent)" }}
              />
              {isRetranscribing ? (
                <span className="flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  Transcribing…
                </span>
              ) : (
                <span>Re-transcribe</span>
              )}
            </label>
          )}
          <button
            onClick={handleClear}
            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
            title="Remove file"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <p className="text-xs text-red-400 px-1">{error}</p>
      )}

      {/* Format hint — pulls limit from the shared constants table so copy
          never drifts if we retune the cap. */}
      {!uploadedFile && !isProcessing && (
        <p className="text-xs text-gray-600 px-1">
          Supported: MP3, M4A, WAV, WebM, OGG · max{" "}
          {formatBytes(MAX_UPLOAD_BYTES.audio)}
        </p>
      )}

      <AssetLibraryModal
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={handleLibraryPick}
        multiSelect={false}
        allowedTypes={["audio"]}
        title="Pick audio from your library"
      />
    </div>
  );
}
