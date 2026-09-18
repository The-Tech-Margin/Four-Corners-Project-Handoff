"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useAIGateway } from "@/hooks/use-ai-gateway";
import { notifyVoice } from "@/lib/notify";

interface VoiceInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  type?: string;
  className?: string;
  /** Max recording time in ms (default 5000 = 5 seconds for short fields) */
  maxRecordingTime?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}

/**
 * Simple input field with inline mic button for voice-to-text.
 * Designed for short fields like name, date, organization.
 * Records, transcribes, and sets the input value directly.
 * No audio playback display - just mic button in the input.
 */
export function VoiceInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  type = "text",
  className = "",
  maxRecordingTime = 5000,
  onKeyDown,
  onBlur,
}: VoiceInputProps) {
  const instanceId = useMemo(
    () => `voice-input-${Date.now()}-${Math.random()}`,
    [],
  );
  const [isTranscribing, setIsTranscribing] = useState(false);
  const { transcribeAudio } = useAIGateway();
  const previousRecordingsCount = useRef(0);

  const {
    isRecording,
    recordings: allRecordings,
    recordingTime,
    isSupported,
    startRecording,
    stopRecording,
  } = useVoiceRecorder(maxRecordingTime, instanceId);

  // Filter to only this instance's recordings
  const recordings = useMemo(
    () => allRecordings.filter((r) => r.instanceId === instanceId),
    [allRecordings, instanceId],
  );

  const handleTranscribe = useCallback(
    async (audioDataUrl: string, mimeType: string) => {
      try {
        setIsTranscribing(true);
        const transcribedText = await transcribeAudio(audioDataUrl, mimeType);
        // Replace input value with transcribed text (trimmed)
        onChange(transcribedText.trim());
      } catch (error) {
        console.error("Transcription failed:", error);
        notifyVoice.transcribeFailed();
      } finally {
        setIsTranscribing(false);
      }
    },
    [transcribeAudio, onChange],
  );

  // Auto-transcribe when a new recording is added
  useEffect(() => {
    const currentCount = recordings.length;

    if (currentCount > previousRecordingsCount.current && currentCount > 0) {
      const latestRecording = recordings[recordings.length - 1];
      handleTranscribe(latestRecording.dataUrl, latestRecording.mimeType);
    }

    previousRecordingsCount.current = currentCount;
  }, [recordings, handleTranscribe]);

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className={`input-icon-wrapper has-icon-right ${className}`}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
      />
      {isSupported && (
        <span className="input-icon-right">
          {isRecording && (
            <span className="voice-input__timer">
              {(recordingTime / 1000).toFixed(1)}s
            </span>
          )}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isTranscribing}
            className={`voice-input__mic-btn ${
              isRecording
                ? "voice-input__mic-btn--recording"
                : isTranscribing
                  ? "voice-input__mic-btn--transcribing"
                  : ""
            }`}
            title={
              isRecording
                ? `Recording... ${(recordingTime / 1000).toFixed(1)}s`
                : isTranscribing
                  ? "Transcribing..."
                  : "Record voice input"
            }
            aria-label={isRecording ? "Stop recording" : "Start voice recording"}
          >
            {isTranscribing ? (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : isRecording ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
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
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </button>
        </span>
      )}
    </div>
  );
}
