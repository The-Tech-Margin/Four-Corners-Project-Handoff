"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useAIGateway } from "@/hooks/use-ai-gateway";
import { useFourCornersStore } from "@/lib/store";
import { notify } from "@/lib/notify";
import { getVoiceRecordingUrl } from "@/lib/api-client/voice";
import { findTranscriptByAudioKey } from "@/lib/api-client/transcripts";
import { mediaStorage } from "@/lib/media-storage";
import { useEagerAudioUpload } from "@/hooks/use-eager-audio-upload";
import { AudioFileUpload } from "./audio-file-upload";
import { FCAudioPlayer } from "./viewer/fc-audio-player";
import { TranscribeModal, type TranscribeModalClip } from "./transcribe-modal";

/**
 * Convert an audio data URL to a Blob for IDB persistence.
 * Mirrors dataUrlToBlob in lib/api-client/media-upload.ts but kept local so
 * this module doesn't reach across server/client boundaries.
 */
function audioDataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : "audio/webm";
    const base64Data = parts[1];
    const byteString = atob(base64Data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
  } catch {
    return null;
  }
}

interface VoiceRecordingPanelProps {
  onTranscriptionComplete?: (text: string) => void;
  maxRecordingTime?: number;
  /** @deprecated No longer used — AudioFileUpload always renders compact */
  compact?: boolean;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onTranscribingStateChange?: (isTranscribing: boolean) => void;
  /** Unique identifier for the field this panel belongs to */
  fieldId?: string;
  /** Optional character count to display */
  charCount?: number;
}

export function VoiceRecordingPanel({
  onTranscriptionComplete,
  maxRecordingTime = 10000,
  onRecordingStateChange,
  onTranscribingStateChange,
  fieldId,
  charCount,
}: VoiceRecordingPanelProps) {
  // Generate unique instance ID to track which recordings belong to this panel
  const instanceId = useMemo(() => `panel-${Date.now()}-${Math.random()}`, []);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  // Track dynamically loaded signed URLs for transcriptions with storage paths
  const [loadedUrls, setLoadedUrls] = useState<Record<string, string>>({});
  const previousRecordingsCount = useRef(0);
  // Per-clip "Transcribe?" modal, opened when a clip is added this session.
  const [pendingClip, setPendingClip] = useState<TranscribeModalClip | null>(null);
  // Only clips added after mount prompt the modal — existing/reloaded notes
  // (created earlier) never do. promptedRef stops re-prompting within a session.
  const mountTimeRef = useRef(Date.now());
  const promptedRef = useRef<Set<string>>(new Set());
  const { transcribeAudio } = useAIGateway();
  const { eagerUploadTranscription } = useEagerAudioUpload();
  const {
    voiceTranscriptions,
    addVoiceTranscription,
    removeVoiceTranscription,
    setVoiceTranscriptions,
    markUnsaved,
  } = useFourCornersStore();

  const {
    isRecording,
    recordings: allRecordings,
    recordingTime,
    isSupported,
    startRecording,
    stopRecording,
    deleteRecording,
  } = useVoiceRecorder(maxRecordingTime, instanceId);

  // Filter recordings to only show this panel's recordings
  const recordings = useMemo(
    () => allRecordings.filter((r) => r.instanceId === instanceId),
    [allRecordings, instanceId],
  );

  const getTranscriptionForRecording = (recordingId: string) => {
    return voiceTranscriptions.find((t) => t.recordingId === recordingId);
  };

  // Get loaded transcriptions (from database) that don't have a current session recording
  // Filter by fieldId if provided for 1:1 field mapping
  const loadedTranscriptions = useMemo(() => {
    const currentRecordingIds = new Set(recordings.map((r) => r.id));
    return voiceTranscriptions.filter(
      (t) =>
        !currentRecordingIds.has(t.recordingId) &&
        // Audio exists if we have storage URL, storage path (can generate URL), or data URL
        (t.audioStorageUrl || t.audioStoragePath || t.audioDataUrl) &&
        // Match fieldId if provided, or show recordings with no fieldId (backward compatibility)
        // If panel has fieldId: show transcriptions matching that fieldId OR with no fieldId
        // If panel has no fieldId: only show transcriptions with no fieldId
        (fieldId ? t.fieldId === fieldId || !t.fieldId : !t.fieldId),
    );
  }, [voiceTranscriptions, recordings, fieldId]);

  // Fetch signed URLs for transcriptions that have storage path but no URL
  useEffect(() => {
    const fetchMissingUrls = async () => {
      const transcriptionsNeedingUrls = loadedTranscriptions.filter(
        (t) => t.audioStoragePath && !t.audioStorageUrl && !loadedUrls[t.id]
      );

      if (transcriptionsNeedingUrls.length === 0) return;

      const newUrls: Record<string, string> = {};
      const updatedTranscriptions: typeof voiceTranscriptions = [];

      for (const transcription of transcriptionsNeedingUrls) {
        if (transcription.audioStoragePath) {
          const url = await getVoiceRecordingUrl(transcription.audioStoragePath);
          if (url) {
            newUrls[transcription.id] = url;
            // Update transcription with the new URL
            updatedTranscriptions.push({
              ...transcription,
              audioStorageUrl: url,
            });
          }
        }
      }

      if (Object.keys(newUrls).length > 0) {
        setLoadedUrls((prev) => ({ ...prev, ...newUrls }));

        // Update the store with refreshed URLs so they persist
        if (updatedTranscriptions.length > 0) {
          const mergedTranscriptions = voiceTranscriptions.map((t) => {
            const updated = updatedTranscriptions.find((u) => u.id === t.id);
            return updated || t;
          });
          setVoiceTranscriptions(mergedTranscriptions);
        }
      }
    };

    fetchMissingUrls();
  }, [loadedTranscriptions, loadedUrls, voiceTranscriptions, setVoiceTranscriptions]);

  const handleTranscribe = useCallback(
    async (
      recordingId: string,
      audioDataUrl: string,
      mimeType: string,
      doTranscribe: boolean = true,
    ) => {
      const loadingToastId = doTranscribe
        ? notify.loading("Transcribing…")
        : undefined;
      try {
        setTranscribingId(recordingId);
        onTranscribingStateChange?.(true);
        // When the user opts out of transcription we still save the audio note,
        // just with empty text (they can re-transcribe later from the library).
        const transcribedText = doTranscribe
          ? await transcribeAudio(audioDataUrl, mimeType)
          : "";

        // Find the recording to get duration
        const recording = recordings.find((r) => r.id === recordingId);

        // Save the raw audio Blob to IDB (mediaStorage). The numeric ID
        // is the durable handle that survives mobile tab-discard / refresh.
        // If this save fails we still proceed — the in-memory audioDataUrl
        // is enough for the immediate save flow; only crash recovery is lost.
        let audioBlobId: number | undefined;
        const blob = audioDataUrlToBlob(audioDataUrl);
        if (blob) {
          try {
            audioBlobId = await mediaStorage.save(
              blob,
              `voice-${recordingId}.${mimeType.split("/")[1]?.split(";")[0] || "webm"}`,
            );
          } catch (e) {
            console.warn("[VoiceRecording] mediaStorage.save failed:", e);
          }
        }

        const transcriptionId = `transcript-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        addVoiceTranscription({
          id: transcriptionId,
          recordingId,
          text: transcribedText,
          transcribedAt: new Date().toISOString(),
          // Field association for 1:1 mapping
          fieldId: fieldId,
          // Store audio data for persistence
          audioDataUrl: audioDataUrl,
          audioBlobId,
          mimeType: mimeType,
          duration: recording?.duration,
        });

        // Save-on-attach: upload to storage + persist in the background so
        // multiple pending clips can't pile up and fail the manual save.
        void eagerUploadTranscription(transcriptionId);

        // Notify parent component of transcription
        if (onTranscriptionComplete) {
          onTranscriptionComplete(transcribedText);
        }

        if (loadingToastId) notify.dismiss(loadingToastId);
        notify.success(doTranscribe ? "Transcription complete" : "Voice note saved");
      } catch (error) {
        console.error("Transcription failed:", error);
        if (loadingToastId) notify.dismiss(loadingToastId);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to transcribe audio. Please check your AI Gateway configuration.";
        notify.error(errorMessage);
      } finally {
        setTranscribingId(null);
        onTranscribingStateChange?.(false);
      }
    },
    [
      transcribeAudio,
      addVoiceTranscription,
      eagerUploadTranscription,
      onTranscriptionComplete,
      onTranscribingStateChange,
      fieldId,
      recordings,
    ],
  );

  // Notify parent of recording state changes
  useEffect(() => {
    onRecordingStateChange?.(isRecording);
  }, [isRecording, onRecordingStateChange]);

  /**
   * Re-transcribe a saved voice note that came from the user's library.
   * The audio is stored remotely (storage URL), so we fetch the bytes,
   * inline them as a data URL, and run Whisper. The transcript text on
   * the matching voice_transcription is updated in place.
   *
   * Triggered by ticking the per-note "Re-transcribe" checkbox in the
   * Saved Voice Notes section. Visibility of that checkbox is driven by
   * recordingId.startsWith("lib-") — the marker set in
   * audio-file-upload.tsx's handleLibraryPick. The prefix survives save
   * via the recording_id column, so the checkbox keeps appearing on
   * reload as long as the note remains library-sourced.
   */
  const transcribeExistingNote = useCallback(
    async (transcriptionId: string) => {
      const vt = voiceTranscriptions.find((t) => t.id === transcriptionId);
      if (!vt) return;
      // Resolve a data URL for Whisper: inline data URL, session recording, or
      // fetched remote storage object.
      let dataUrl: string | undefined =
        vt.audioDataUrl && vt.audioDataUrl.startsWith("data:")
          ? vt.audioDataUrl
          : recordings.find((r) => r.id === vt.recordingId)?.dataUrl;
      if (!dataUrl) {
        const remoteUrl = vt.audioStorageUrl || loadedUrls[vt.id];
        if (!remoteUrl) {
          notify.error("Audio not loaded yet — try again in a moment");
          return;
        }
        try {
          const res = await fetch(remoteUrl);
          if (!res.ok) throw new Error(`Couldn't fetch audio (${res.status})`);
          const blob = await res.blob();
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error || new Error("Read failed"));
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          notify.error(err instanceof Error ? err.message : "Couldn't load audio");
          return;
        }
      }
      setTranscribingId(transcriptionId);
      try {
        const text = await transcribeAudio(dataUrl, vt.mimeType);
        setVoiceTranscriptions(
          useFourCornersStore
            .getState()
            .voiceTranscriptions.map((t) =>
              t.id === transcriptionId
                ? { ...t, text, transcribedAt: new Date().toISOString() }
                : t,
            ),
        );
        markUnsaved();
        // Persist the updated text (and audio, if still local) in the background.
        void eagerUploadTranscription(transcriptionId);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setTranscribingId(null);
      }
    },
    [voiceTranscriptions, recordings, loadedUrls, transcribeAudio, setVoiceTranscriptions, markUnsaved, eagerUploadTranscription],
  );

  /**
   * Per-clip control for library-sourced notes:
   *  - unchecked → hide: clear the transcript text on this project (audio stays).
   *  - checked → reuse an existing transcription for this clip if one exists
   *    (no AI call), otherwise transcribe it.
   */
  const handleLibraryToggle = useCallback(
    async (transcriptionId: string, checked: boolean) => {
      const vt = voiceTranscriptions.find((t) => t.id === transcriptionId);
      if (!vt) return;
      if (!checked) {
        setVoiceTranscriptions(
          voiceTranscriptions.map((t) =>
            t.id === transcriptionId ? { ...t, text: "" } : t,
          ),
        );
        markUnsaved();
        return;
      }
      if (vt.audioStoragePath) {
        try {
          const existing = await findTranscriptByAudioKey(vt.audioStoragePath);
          if (existing) {
            setVoiceTranscriptions(
              useFourCornersStore
                .getState()
                .voiceTranscriptions.map((t) =>
                  t.id === transcriptionId ? { ...t, text: existing } : t,
                ),
            );
            markUnsaved();
            return;
          }
        } catch {
          /* fall through to transcribe */
        }
      }
      transcribeExistingNote(transcriptionId);
    },
    [voiceTranscriptions, setVoiceTranscriptions, markUnsaved, transcribeExistingNote],
  );

  // New recordings are saved WITHOUT transcription; the modal (opened by the
  // detector below) handles the transcription decision.
  useEffect(() => {
    const currentCount = recordings.length;

    if (currentCount > previousRecordingsCount.current && currentCount > 0) {
      const latestRecording = recordings[recordings.length - 1];

      const existingTranscription = voiceTranscriptions.find(
        (t) => t.recordingId === latestRecording.id,
      );
      if (!existingTranscription && transcribingId !== latestRecording.id) {
        handleTranscribe(
          latestRecording.id,
          latestRecording.dataUrl,
          latestRecording.mimeType,
          false, // create untranscribed; the modal decides whether to transcribe
        );
      }
    }

    previousRecordingsCount.current = currentCount;
  }, [recordings, transcribingId, handleTranscribe, voiceTranscriptions]);

  // Detector: when a clip is ADDED this session (record/upload/library) and is
  // still untranscribed, open the per-clip Transcribe modal. Clips created
  // before mount (reloaded notes) and already-prompted ones are skipped.
  useEffect(() => {
    if (pendingClip) return; // one modal at a time
    const candidate = voiceTranscriptions.find((t) => {
      const fieldMatch = fieldId
        ? t.fieldId === fieldId || !t.fieldId
        : !t.fieldId;
      if (!fieldMatch) return false;
      if ((t.text ?? "") !== "") return false;
      if (promptedRef.current.has(t.id)) return false;
      if (transcribingId === t.id) return false;
      const hasAudio =
        !!t.audioDataUrl ||
        !!t.audioStorageUrl ||
        !!t.audioStoragePath ||
        recordings.some((r) => r.id === t.recordingId);
      if (!hasAudio) return false;
      const created = t.transcribedAt ? Date.parse(t.transcribedAt) : 0;
      return created >= mountTimeRef.current;
    });
    if (candidate) {
      promptedRef.current.add(candidate.id);
      setPendingClip({
        id: candidate.id,
        isLibrary: !!candidate.recordingId?.startsWith("lib-"),
        audioStoragePath: candidate.audioStoragePath,
      });
    }
  }, [voiceTranscriptions, pendingClip, fieldId, transcribingId, recordings]);

  // Apply an existing transcription (library "Use transcription") to a note.
  const applyExistingTranscription = useCallback(
    (transcriptionId: string, text: string) => {
      setVoiceTranscriptions(
        useFourCornersStore
          .getState()
          .voiceTranscriptions.map((t) =>
            t.id === transcriptionId
              ? { ...t, text, transcribedAt: new Date().toISOString() }
              : t,
          ),
      );
      markUnsaved();
    },
    [setVoiceTranscriptions, markUnsaved],
  );

  return (
    <div className="border-t border-border/50">
      {/* Recording Controls */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {!isSupported && (
            <span className="text-xs text-orange-500">
              Recording not supported on this device
            </span>
          )}
          {!isRecording && isSupported ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-accent hover:text-gray-900 dark:hover:text-accent-dark bg-accent/10 hover:bg-accent/20 rounded-lg transition-colors"
              aria-label="Record voice note"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
              </svg>
              Record
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
              aria-label="Stop recording"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop ·{" "}
              {typeof recordingTime === "number"
                ? (recordingTime / 1000).toFixed(1)
                : "0.0"}
              s
            </button>
          )}
          {isRecording && (
            <div className="flex items-center gap-1.5 text-xs text-red-500">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              Recording
            </div>
          )}
          {!isRecording && recordings.length > 0 && (
            <span className="text-xs text-gray-600">
              {recordings.length} recording{recordings.length > 1 ? "s" : ""}
            </span>
          )}
          {/* Audio file upload - always available */}
          {!isRecording && (
            <AudioFileUpload
              onTranscriptionComplete={onTranscriptionComplete}
              fieldId={fieldId}
              compact={true}
            />
          )}
        </div>
        {/* Character count on right side */}
        {charCount !== undefined && (
          <span className="text-xs text-gray-600">{charCount}</span>
        )}
      </div>

      {/* Recordings List */}
      {recordings.length > 0 && (
        <div className="px-4 py-3 space-y-2 border-t border-border/50">
          {recordings.map((recording) => {
            const transcription = getTranscriptionForRecording(recording.id);

            return (
              <div key={recording.id} className="space-y-2.5 sm:space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1"><FCAudioPlayer src={recording.dataUrl} duration={recording.duration ? recording.duration / 1000 : undefined} /></div>
                  <a
                    href={recording.dataUrl}
                    download={`voice-note-${new Date(recording.timestamp)
                      .toISOString()
                      .slice(0, 19)
                      .replace(/:/g, "-")}.webm`}
                    className="p-1 text-gray-600 hover:text-accent transition-colors"
                    title="Download recording"
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                  </a>
                  <button
                    onClick={() => deleteRecording(recording.id)}
                    className="p-1 text-gray-600 hover:text-orange-500 transition-colors"
                    title="Delete recording"
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                {transcription && transcription.text && (
                  <div>
                    <textarea
                      value={transcription.text}
                      onChange={(e) => {
                        const updated = voiceTranscriptions.map((t) =>
                          t.id === transcription.id ? { ...t, text: e.target.value } : t
                        );
                        setVoiceTranscriptions(updated);
                        markUnsaved();
                      }}
                      className="w-full text-xs sm:text-[11px] text-gray-300 leading-relaxed bg-transparent border-0 resize-y focus:outline-none focus:ring-0 p-0 min-h-[3.5em]"
                      rows={3}
                    />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] sm:text-[9px] text-gray-600">
                        Transcribed{" "}
                        {new Date(
                          transcription.transcribedAt,
                        ).toLocaleTimeString()}
                      </span>
                      <button
                        onClick={() =>
                          removeVoiceTranscription(transcription.id)
                        }
                        className="text-[10px] sm:text-[9px] text-gray-600 hover:text-orange-500 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs text-gray-600 pt-1">
            {voiceTranscriptions.length > 0
              ? "Transcriptions automatically added to text"
              : "Recordings will be automatically transcribed"}
          </p>
        </div>
      )}

      {/* Loaded Transcriptions (from saved projects) */}
      {loadedTranscriptions.length > 0 && (
        <div className="px-4 py-3 space-y-2 border-t border-border/50">
          <div className="flex items-center gap-1.5 mb-2">
            <svg
              className="w-3.5 h-3.5 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
            <span className="text-xs text-gray-500">Saved Voice Notes</span>
          </div>
          {loadedTranscriptions.map((transcription) => {
            // Use storage URL, dynamically loaded URL, or data URL
            const audioSrc =
              transcription.audioStorageUrl ||
              loadedUrls[transcription.id] ||
              transcription.audioDataUrl;
            // Show loading state while fetching URL for transcriptions with storage path
            const isLoadingUrl = transcription.audioStoragePath && !audioSrc;

            return (
              <div key={transcription.id} className="space-y-2.5 sm:space-y-1.5">
                <div className="flex items-center gap-2">
                  {isLoadingUrl ? (
                    <div className="flex-1 h-6 bg-surface rounded flex items-center justify-center gap-2">
                      <svg className="w-3 h-3 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-[10px] text-gray-500">Loading audio...</span>
                    </div>
                  ) : audioSrc ? (
                    <div className="flex-1"><FCAudioPlayer src={audioSrc} /></div>
                  ) : (
                    <div className="flex-1 h-6 bg-surface rounded flex items-center justify-center">
                      <span className="text-[10px] text-gray-500">
                        Audio unavailable
                      </span>
                    </div>
                  )}
                  {audioSrc && (
                    <a
                      href={audioSrc}
                      download={`voice-note-${transcription.recordingId}.webm`}
                      className="p-1 text-gray-600 hover:text-accent transition-colors"
                      title="Download recording"
                    >
                      <svg
                        className="w-3.5 h-3.5"
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
                    </a>
                  )}
                  <button
                    onClick={() => removeVoiceTranscription(transcription.id)}
                    className="p-1 text-gray-600 hover:text-orange-500 transition-colors"
                    title="Remove transcription"
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                {/* Transcript text — only when present; no box/border so it
                    fills the width. */}
                {(transcription.text ||
                  transcription.recordingId?.startsWith("lib-")) && (
                  <div>
                    {transcription.text && (
                      <textarea
                        value={transcription.text}
                        onChange={(e) => {
                          const updated = voiceTranscriptions.map((t) =>
                            t.id === transcription.id ? { ...t, text: e.target.value } : t
                          );
                          setVoiceTranscriptions(updated);
                          markUnsaved();
                        }}
                        className="w-full text-xs sm:text-[11px] text-gray-300 leading-relaxed bg-transparent border-0 resize-y focus:outline-none focus:ring-0 p-0 min-h-[3.5em]"
                        rows={3}
                      />
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] sm:text-[9px] text-gray-600">
                        {transcription.text
                          ? `${
                              transcription.duration
                                ? `${(transcription.duration / 1000).toFixed(1)}s · `
                                : ""
                            }Transcribed ${new Date(
                              transcription.transcribedAt,
                            ).toLocaleDateString()}`
                          : transcription.duration
                            ? `${(transcription.duration / 1000).toFixed(1)}s`
                            : ""}
                      </span>
                      {/* Library notes: Show/Hide the existing transcript (no AI)
                          when one exists, else Transcribe (reuse-or-Whisper). */}
                      {transcription.recordingId?.startsWith("lib-") && (
                        <label
                          className="inline-flex items-center gap-1.5 text-[10px] sm:text-[9px] cursor-pointer select-none"
                          style={{ color: "var(--fc-text-muted)" }}
                          title={
                            transcription.text
                              ? "Show or hide this transcription on this project"
                              : "Reuse an existing transcription or run Whisper"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={!!transcription.text}
                            disabled={transcribingId === transcription.id}
                            onChange={(e) =>
                              handleLibraryToggle(transcription.id, e.target.checked)
                            }
                            className="w-3.5 h-3.5 flex-shrink-0 rounded bg-white dark:bg-surface-alt border-border text-accent focus:ring-accent/30 cursor-pointer"
                          />
                          {transcribingId === transcription.id
                            ? "Transcribing…"
                            : transcription.text
                              ? "Show transcription"
                              : "Transcribe"}
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TranscribeModal
        clip={pendingClip}
        onTranscribe={transcribeExistingNote}
        onUseExisting={applyExistingTranscription}
        onSkip={() => setPendingClip(null)}
      />
    </div>
  );
}
