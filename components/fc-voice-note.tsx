"use client";

/**
 * FCVoiceNote — the ONE audio + transcription display block.
 *
 * Every place that shows a voice note (viewer panels, view-page cards, the
 * editor's saved-notes list) renders this so behavior is identical: for each
 * audio unit, the player renders first with the transcription text below it;
 * a clip without transcription shows the player alone. A transcription whose
 * text merely duplicates a sibling clip's is never rendered as a second
 * text-only block.
 *
 * Audio source resolution order (shared by all surfaces):
 *   audioStorageUrl → signed audioStoragePath → audioDataUrl → IDB audioBlobId
 */

import { useState, useEffect, useRef } from "react";
import type { VoiceTranscription } from "@/lib/field-registry";
import { FCAudioPlayer } from "./viewer/fc-audio-player";
import { getVoiceRecordingUrl } from "@/lib/api-client/voice";
import { mediaStorage } from "@/lib/media-storage";

/** A transcription "has audio" if any resolvable source exists. */
export function hasAudioSource(vt: VoiceTranscription): boolean {
  return Boolean(
    vt.audioStorageUrl ||
      vt.audioStoragePath ||
      vt.audioDataUrl ||
      typeof vt.audioBlobId === "number",
  );
}

/**
 * Dedupe a field's/item's transcription list for display (pure; unit-tested):
 * - collapse entries with identical id (defensive)
 * - drop audio-less entries whose text duplicates an entry that has audio
 * - drop audio-less empty-text entries when any sibling has audio
 * Text-only notes survive only when no sibling carries the same content as
 * audio — so a transcript is never shown twice next to its own recording.
 */
export function dedupeVoiceNotes(
  transcriptions: VoiceTranscription[],
): VoiceTranscription[] {
  const seenIds = new Set<string>();
  const unique = transcriptions.filter((t) => {
    if (seenIds.has(t.id)) return false;
    seenIds.add(t.id);
    return true;
  });

  const withAudio = unique.filter(hasAudioSource);
  if (withAudio.length === 0) return unique;

  const audioTexts = new Set(
    withAudio.map((t) => (t.text ?? "").trim()).filter(Boolean),
  );

  return unique.filter((t) => {
    if (hasAudioSource(t)) return true;
    const text = (t.text ?? "").trim();
    if (!text) return false; // nothing to show that the players don't already
    return !audioTexts.has(text); // duplicate of a recorded note's transcript
  });
}

/**
 * Resolve a playable src for one transcription.
 * Object URLs created from IDB blobs are revoked on unmount.
 */
function useResolvedAudioSrc(vt: VoiceTranscription): string | null {
  const [resolved, setResolved] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const attemptedRef = useRef(false);

  const direct = vt.audioStorageUrl || vt.audioDataUrl || null;

  useEffect(() => {
    if (direct || attemptedRef.current) return;
    attemptedRef.current = true;
    let cancelled = false;

    const resolve = async () => {
      if (vt.audioStoragePath) {
        const url = await getVoiceRecordingUrl(vt.audioStoragePath);
        if (url && !cancelled) {
          setResolved(url);
          return;
        }
      }
      if (typeof vt.audioBlobId === "number") {
        try {
          const stored = await mediaStorage.get(vt.audioBlobId);
          if (stored?.blob && !cancelled) {
            const objectUrl = URL.createObjectURL(stored.blob);
            objectUrlRef.current = objectUrl;
            setResolved(objectUrl);
          }
        } catch {
          // No local blob either — player stays hidden, text still shows.
        }
      }
    };
    void resolve();

    return () => {
      cancelled = true;
    };
  }, [direct, vt.audioStoragePath, vt.audioBlobId]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  return direct || resolved;
}

interface FCVoiceNoteClipProps {
  transcription: VoiceTranscription;
  accentClass?: string;
  accentTextClass?: string;
  /** Optional label above the clip (e.g. "Voice transcription"). */
  label?: React.ReactNode;
  /** Extra class on the wrapper. */
  className?: string;
  /** Custom transcript renderer (e.g. a clamping/expandable block). */
  renderText?: (text: string) => React.ReactNode;
}

/** One clip: player first, transcription underneath (if any). */
export function FCVoiceNoteClip({
  transcription,
  accentClass,
  accentTextClass,
  label,
  className,
  renderText,
}: FCVoiceNoteClipProps) {
  const audioSrc = useResolvedAudioSrc(transcription);
  const text = (transcription.text ?? "").trim();

  if (!audioSrc && !text) return null;

  return (
    <div className={className ?? "fc-voice-note"}>
      {label}
      {audioSrc ? (
        <FCAudioPlayer
          src={audioSrc}
          duration={transcription.duration}
          accentClass={accentClass}
          accentTextClass={accentTextClass}
        />
      ) : transcription.audioStoragePath || typeof transcription.audioBlobId === "number" ? (
        <div className="text-xs text-gray-500">Loading audio…</div>
      ) : null}
      {text &&
        (renderText ? (
          <div className={audioSrc ? "mt-2" : undefined}>{renderText(text)}</div>
        ) : (
          <p className={audioSrc ? "fc-voice-note__text mt-2" : "fc-voice-note__text"}>
            {text}
          </p>
        ))}
    </div>
  );
}

interface FCVoiceNoteProps {
  /** Transcriptions already scoped to one field / context item. */
  transcriptions: VoiceTranscription[];
  accentClass?: string;
  accentTextClass?: string;
  /** Label rendered above each clip (e.g. the "Voice transcription" tag). */
  renderLabel?: (vt: VoiceTranscription) => React.ReactNode;
  /** Custom transcript renderer (e.g. a clamping/expandable block). */
  renderText?: (text: string) => React.ReactNode;
  className?: string;
  clipClassName?: string;
}

/** A field's full set of voice notes, deduped, players-first. */
export function FCVoiceNote({
  transcriptions,
  accentClass,
  accentTextClass,
  renderLabel,
  renderText,
  className,
  clipClassName,
}: FCVoiceNoteProps) {
  const visible = dedupeVoiceNotes(transcriptions);
  if (visible.length === 0) return null;

  return (
    <div className={className}>
      {visible.map((vt) => (
        <FCVoiceNoteClip
          key={vt.id}
          transcription={vt}
          accentClass={accentClass}
          accentTextClass={accentTextClass}
          label={renderLabel?.(vt)}
          className={clipClassName}
          renderText={renderText}
        />
      ))}
    </div>
  );
}
