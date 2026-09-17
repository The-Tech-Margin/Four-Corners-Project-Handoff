"use client";

import { AudioFileUpload } from "./audio-file-upload";

interface AudioUploadSectionProps {
  /** Callback when transcription is complete */
  onTranscriptionComplete?: (text: string) => void;
  /** Unique identifier for the field this upload belongs to */
  fieldId?: string;
  /** Section title */
  title?: string;
  /** Custom class name */
  className?: string;
}

/**
 * Standalone audio upload section for forms.
 * Provides a full upload interface with file preview and transcription.
 * Can be used independently or alongside VoiceRecordingPanel.
 */
export function AudioUploadSection({
  onTranscriptionComplete,
  fieldId,
  title = "Upload Audio",
  className = "",
}: AudioUploadSectionProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {title && (
        <label className="block text-xs text-gray-500 font-medium">
          {title}
        </label>
      )}
      <AudioFileUpload
        onTranscriptionComplete={onTranscriptionComplete}
        fieldId={fieldId}
        compact={false}
      />
    </div>
  );
}
