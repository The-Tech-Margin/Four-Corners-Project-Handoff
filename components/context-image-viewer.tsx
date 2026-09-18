"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Modal from "./modal";
import { VoiceTextarea } from "./voice-textarea";
import { Mic, Square, Trash2, Library } from "lucide-react";
import { notify } from "@/lib/notify";
import { FCAudioPlayer } from "./viewer/fc-audio-player";
import { AssetLibraryModal } from "./asset-library-modal";
import type { UserAsset } from "@/lib/field-registry";

interface ContextImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  image: {
    id?: string;
    url?: string;
    src?: string;
    storage_url?: string;
    thumbnail_storage_url?: string;
    thumbnailDataUrl?: string;
    caption?: string;
    description?: string;
    credit?: string;
    date?: string;
    filename?: string;
    type?: string;
    sourceType?: string;
    blobId?: number;
    mimeType?: string;
    audioDataUrl?: string;
    audioStorageUrl?: string;
    audioMimeType?: string;
    audioDuration?: number;
  } | null;
  onRemove?: () => void;
  onUpdateCaption?: (caption: string) => void;
  onUpdateDescription?: (description: string) => void;
  onUpdateCredit?: (credit: string) => void;
  onUpdateDate?: (date: string) => void;
  onUpdateAudio?: (
    audioData: {
      audioDataUrl?: string;
      audioMimeType?: string;
      audioDuration?: number;
    } | null,
  ) => void;
  onMakeMainImage?: () => void;
  /**
   * Swap this context item's source to a library asset. Caller maps the
   * UserAsset onto the existing ContextItem via updateContext(...).
   */
  onReplace?: (asset: UserAsset) => void;
  /** Index of the image in the context images array, used to create unique field IDs */
  imageIndex?: number;
}

export function ContextImageViewer({
  isOpen,
  onClose,
  image,
  onRemove,
  onUpdateCaption,
  onUpdateDescription,
  onUpdateCredit,
  onUpdateDate,
  onUpdateAudio,
  onMakeMainImage,
  onReplace,
  imageIndex = 0,
}: ContextImageViewerProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [description, setDescription] = useState("");
  const [credit, setCredit] = useState("");
  const [date, setDate] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Reset fields when image prop changes — derived state from props pattern
  const [prevImageId, setPrevImageId] = useState(image?.id);
  if (image?.id !== prevImageId) {
    setPrevImageId(image?.id);
    setCaption(image?.caption || "");
    setDescription(image?.description || "");
    setCredit(image?.credit || "");
    setDate(image?.date || "");
    setAudioUrl(image?.audioStorageUrl || image?.audioDataUrl || null);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!window.isSecureContext) {
      notify.error("Audio recording requires a secure (HTTPS) connection.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const recordedMimeType =
          mediaRecorderRef.current?.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: recordedMimeType });
        const reader = new FileReader();

        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const duration = Date.now() - startTimeRef.current;

          setAudioUrl(dataUrl);

          if (onUpdateAudio) {
            onUpdateAudio({
              audioDataUrl: dataUrl,
              audioMimeType: recordedMimeType,
              audioDuration: duration,
            });
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      startTimeRef.current = Date.now();
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(Date.now() - startTimeRef.current);
      }, 100);

      // Safety cap: 5 minutes to prevent accidental infinite recordings
      safetyTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          stopRecording();
        }
      }, 5 * 60 * 1000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      notify.error(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow access in your browser settings."
          : "Could not access microphone. Check that no other app is using it.",
      );
    }
  }, [onUpdateAudio, stopRecording]);

  const deleteAudio = useCallback(() => {
    setAudioUrl(null);
    if (onUpdateAudio) {
      onUpdateAudio(null);
    }
  }, [onUpdateAudio]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  if (!image) return null;

  // Prioritize full-size image when available
  const displaySrc =
    image.storage_url || image.url || image.src || image.thumbnailDataUrl || "";
  const isVideo = image.type?.startsWith("video/");

  const handleRemove = () => {
    if (onRemove) {
      onRemove();
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Related Image"
      maxWidth="2xl"
    >
      <div className="px-4 sm:px-5 py-4">
        {/* Image Display */}
        <div className="mb-4 bg-black rounded-lg overflow-hidden">
          {isVideo ? (
            <div className="aspect-video flex items-center justify-center bg-gray-900">
              <svg
                className="w-16 h-16 text-gray-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
          ) : (
            <img
              src={displaySrc}
              alt={caption || "Context image"}
              className="w-full max-h-[60vh] object-contain fc-protected-img"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
        </div>

        {/* Image Info */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Caption <span className="text-gray-600">(optional)</span>
            </label>
            <VoiceTextarea
              value={caption}
              onChange={(value) => {
                setCaption(value);
                // Auto-save caption when changed
                if (onUpdateCaption) {
                  onUpdateCaption(value);
                }
              }}
              placeholder="Add a caption for this image..."
              ariaLabel="Image caption"
              rows={2}
              fieldId={image?.id ? `context-${image.id}` : `context-image-caption-${imageIndex}`}
              borderColor="border-border/40"
            />
          </div>

          {/* Description field */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Description <span className="text-gray-600">(optional)</span>
            </label>
            <VoiceTextarea
              value={description}
              onChange={(value) => {
                setDescription(value);
                if (onUpdateDescription) {
                  onUpdateDescription(value);
                }
              }}
              placeholder="Extended description or alt text..."
              ariaLabel="Image description"
              rows={2}
              fieldId={image?.id ? `context-desc-${image.id}` : `context-image-description-${imageIndex}`}
              borderColor="border-border/40"
            />
          </div>

          {/* Credit and Date row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Credit <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="text"
                value={credit}
                onChange={(e) => {
                  setCredit(e.target.value);
                  if (onUpdateCredit) {
                    onUpdateCredit(e.target.value);
                  }
                }}
                placeholder="Photo credit / attribution"
                className="w-full px-3 py-2 bg-surface border border-border/40 rounded-lg text-sm text-foreground placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-corner-context/50 focus:border-corner-context/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Date <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="text"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (onUpdateDate) {
                    onUpdateDate(e.target.value);
                  }
                }}
                placeholder="Date (e.g., 2024-01-15)"
                className="w-full px-3 py-2 bg-surface border border-border/40 rounded-lg text-sm text-foreground placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-corner-context/50 focus:border-corner-context/50"
              />
            </div>
          </div>

          {/* Voice Recording for this image */}
          <div className="pt-3 border-t border-border/30">
            <label className="block text-xs text-gray-500 mb-2">
              Voice Note <span className="text-gray-600">(optional)</span>
            </label>

            {audioUrl ? (
              <div className="flex items-center gap-2">
                <div className="flex-1"><FCAudioPlayer src={audioUrl} /></div>
                <button
                  onClick={deleteAudio}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                  title="Delete recording"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isRecording
                    ? "bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse"
                    : "bg-corner-context/10 text-corner-context border border-corner-context/30 hover:bg-corner-context/20"
                }`}
              >
                {isRecording ? (
                  <>
                    <Square size={16} className="fill-current" />
                    <span>Stop {formatTime(recordingTime)}</span>
                  </>
                ) : (
                  <>
                    <Mic size={16} />
                    <span>Record Voice Note</span>
                  </>
                )}
              </button>
            )}
            {!audioUrl && !isRecording && (
              <p className="text-[10px] text-gray-600 mt-1">
                Up to 5 minutes per recording
              </p>
            )}
          </div>

          {/* Metadata */}
          <div className="pt-3 border-t border-border/30 space-y-2">
            {image.filename && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 font-medium min-w-20">
                  Filename:
                </span>
                <span className="text-xs text-gray-400 font-mono break-all">
                  {image.filename}
                </span>
              </div>
            )}
            {image.url && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 font-medium min-w-20">
                  URL:
                </span>
                <a
                  href={image.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-corner-context hover:underline break-all"
                >
                  {image.url}
                </a>
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-500 font-medium min-w-20">
                Source:
              </span>
              <span className="text-xs text-gray-400">
                {image.sourceType === "upload" ? "Uploaded" : "URL"}
              </span>
            </div>
            {image.type && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 font-medium min-w-20">
                  Type:
                </span>
                <span className="text-xs text-gray-400">{image.type}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions - stack on mobile, row on larger */}
        <div className="flex flex-col sm:flex-row gap-2 mt-6 pt-4 border-t border-border/30">
          {onMakeMainImage && (
            <button
              onClick={() => {
                onMakeMainImage();
                onClose();
              }}
              className="w-full sm:flex-1 px-4 py-3 sm:py-2 bg-corner-context/20 hover:bg-corner-context/30 border border-corner-context rounded-lg text-sm font-medium text-corner-context transition-colors flex items-center justify-center gap-2"
              title="Create a new file with this image as the main image"
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
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Create New File
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 sm:py-2 bg-surface-alt hover:bg-surface border border-border rounded-lg text-sm font-medium text-gray-300 hover:text-gray-200 transition-colors"
            >
              Close
            </button>
            {onReplace && (
              <button
                onClick={() => setLibraryOpen(true)}
                title="Replace from your library"
                aria-label="Replace from your library"
                className="px-4 py-3 sm:py-2 bg-surface-alt hover:bg-surface border border-border hover:border-corner-context/60 rounded-lg text-sm font-medium text-gray-300 hover:text-corner-context transition-colors flex items-center gap-1.5"
              >
                <Library className="w-4 h-4" aria-hidden="true" />
                Replace
              </button>
            )}
            {onRemove && (
              <button
                onClick={handleRemove}
                className="px-4 py-3 sm:py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Library picker for Replace — single-select, auto-closes on pick. */}
      {onReplace && (
        <AssetLibraryModal
          isOpen={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onSelect={(assets) => {
            const picked = assets[0];
            if (picked) onReplace(picked);
          }}
          multiSelect={false}
          allowedTypes={["image", "video"]}
          title="Replace with…"
        />
      )}
    </Modal>
  );
}
