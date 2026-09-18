"use client";

import { useState } from "react";
import { VoiceRecordingPanel } from "./voice-recording-panel";

interface VoiceTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  rows?: number;
  showCharCount?: boolean;
  borderColor?: string;
  className?: string;
  /** Unique identifier for this field - used to associate voice recordings */
  fieldId?: string;
  /**
   * When true, voice transcriptions are stored as VoiceTranscription records
   * but NOT auto-filled into the text field. This keeps the typed text and
   * voice transcription as independent data.
   * Default: false (legacy dictation mode — transcription fills the field).
   */
  separateTranscription?: boolean;
  /**
   * When true, the field bleeds to the screen edge on mobile (square corners,
   * negative horizontal margin) so a colored left border sits flush. Reverts
   * to a normal rounded, inset card at the sm breakpoint and up.
   */
  mobileFlush?: boolean;
}

export function VoiceTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  rows = 4,
  showCharCount = false,
  borderColor = "border-border/40",
  className = "",
  fieldId,
  separateTranscription = false,
  mobileFlush = false,
}: VoiceTextareaProps) {
  const [charCount, setCharCount] = useState(value.length);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setCharCount(newValue.length);
  };

  const handleTranscriptionComplete = (transcribedText: string) => {
    // In separateTranscription mode, the transcription is only stored
    // as a VoiceTranscription record (by VoiceRecordingPanel) — don't
    // modify the text field content.
    if (separateTranscription) return;

    // Dictation mode: append transcribed text to existing content
    const newText = value ? `${value}\n\n${transcribedText}` : transcribedText;
    onChange(newText);
    setCharCount(newText.length);
  };

  return (
    <div
      className={`bg-surface-alt border overflow-hidden ${
        mobileFlush ? "rounded-none sm:rounded-xl -mx-4 sm:mx-0" : "rounded-xl"
      } ${borderColor} ${className}`}
    >
      <textarea
        value={value}
        onChange={handleTextChange}
        className="w-full bg-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-gray-200 resize-y border-0 focus:ring-0 focus:outline-none min-h-[80px]"
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />

      {/* Voice recording panel with optional character count */}
      <VoiceRecordingPanel
        onTranscriptionComplete={handleTranscriptionComplete}
        fieldId={fieldId}
        charCount={showCharCount ? charCount : undefined}
      />
    </div>
  );
}
