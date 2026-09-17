"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { findTranscriptByAudioKey } from "@/lib/api-client/transcripts";

export const TRANSCRIBE_PRIVACY =
  "A private API call to an AI transcription service will run. Your information is not stored or used by the AI for training.";

export interface TranscribeModalClip {
  id: string;
  /** Library-sourced clips may already have a transcription to reuse. */
  isLibrary: boolean;
  audioStoragePath?: string;
}

interface TranscribeModalProps {
  clip: TranscribeModalClip | null;
  /** Run Whisper on the clip (returns when done). */
  onTranscribe: (id: string) => Promise<void> | void;
  /** Apply an already-existing transcription to the clip (no AI call). */
  onUseExisting: (id: string, text: string) => void;
  /** Dismiss without transcribing — the clip stays as an untranscribed note. */
  onSkip: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Per-clip "Transcribe audio?" dialog, opened when a clip is added (record /
 * upload / library). Centralizes the transcription decision. Accessible:
 * role=dialog + aria-modal, labelled/described, focus trap + restore,
 * Escape = skip, Enter = primary.
 */
export function TranscribeModal({
  clip,
  onTranscribe,
  onUseExisting,
  onSkip,
}: TranscribeModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<Element | null>(null);

  // undefined = still looking up; null = none; string = existing transcript
  const [existingText, setExistingText] = useState<string | null | undefined>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const isOpen = clip !== null;

  // Look up an existing transcription for library clips (no AI call).
  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    setBusy(false);
    if (clip.isLibrary && clip.audioStoragePath) {
      setExistingText(undefined);
      findTranscriptByAudioKey(clip.audioStoragePath)
        .then((t) => {
          if (!cancelled) setExistingText(t ?? null);
        })
        .catch(() => {
          if (!cancelled) setExistingText(null);
        });
    } else {
      setExistingText(null);
    }
    return () => {
      cancelled = true;
    };
  }, [clip]);

  const handleSkip = useCallback(() => {
    if (busy) return;
    onSkip();
  }, [busy, onSkip]);

  const handlePrimary = useCallback(async () => {
    if (!clip || busy || existingText === undefined) return;
    if (existingText) {
      onUseExisting(clip.id, existingText);
      onSkip(); // close
      return;
    }
    setBusy(true);
    try {
      await onTranscribe(clip.id);
    } finally {
      onSkip(); // close after transcription resolves
    }
  }, [clip, busy, existingText, onTranscribe, onUseExisting, onSkip]);

  // Focus management + keyboard: trap Tab, Escape = skip, Enter = primary.
  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement;
    // Focus the primary action once mounted.
    const focusTimer = window.setTimeout(() => primaryRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
        return;
      }
      if (e.key === "Enter") {
        const target = e.target as HTMLElement | null;
        // Let a focused button handle Enter itself; otherwise trigger primary.
        if (target?.tagName !== "BUTTON") {
          e.preventDefault();
          handlePrimary();
        }
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const nodes = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => el.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      // Restore focus to the element that was focused before opening.
      if (restoreFocusRef.current instanceof HTMLElement) {
        restoreFocusRef.current.focus();
      }
    };
  }, [isOpen, handleSkip, handlePrimary]);

  if (!isOpen) return null;

  const looking = existingText === undefined;
  const hasExisting = !!existingText;
  const primaryLabel = hasExisting ? "Use transcription" : "Transcribe";

  const modal = (
    <div
      className="modal-overlay fixed inset-0 flex items-center justify-center z-[9999] p-4"
      onClick={handleSkip}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="rounded-2xl max-w-md w-full p-6 shadow-2xl"
        style={{
          background: "var(--fc-surface)",
          border: "1px solid var(--fc-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ background: "var(--fc-accent)" }}
            aria-hidden="true"
          />
          <h2
            id={titleId}
            className="text-lg font-medium"
            style={{ color: "var(--fc-text)" }}
          >
            Transcribe audio?
          </h2>
        </div>

        <p
          id={descId}
          className="text-sm leading-relaxed"
          style={{ color: "var(--fc-text-secondary)" }}
        >
          {hasExisting
            ? "This clip already has a transcription. Add it to this project, or skip and keep just the audio."
            : TRANSCRIBE_PRIVACY}
        </p>

        <div aria-live="polite" className="min-h-[1.25rem] mt-3">
          {busy && (
            <span
              className="inline-flex items-center gap-2 text-sm"
              style={{ color: "var(--fc-accent)" }}
            >
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Transcribing…
            </span>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleSkip}
            disabled={busy}
            className="flex-1 py-2.5 text-sm rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fc-accent)] disabled:opacity-50"
            style={{
              background: "var(--fc-surface-alt)",
              color: "var(--fc-text-muted)",
              border: "1px solid var(--fc-border)",
            }}
          >
            Skip
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={handlePrimary}
            disabled={busy || looking}
            className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--fc-accent)] disabled:opacity-50"
            style={{
              background: "var(--fc-accent)",
              color: "var(--fc-accent-on)",
            }}
          >
            {looking ? "Checking…" : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
