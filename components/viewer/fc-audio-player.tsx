"use client";

import { useState, useRef, useCallback } from "react";

function fmt(s: number): string {
  if (!s || !isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

/**
 * Inline audio player styled with FC design tokens.
 * Replaces native <audio controls> for consistent look across panels.
 */
export function FCAudioPlayer({
  src,
  duration: initDur,
  accentClass = "fc-audio-player__btn--default",
  accentTextClass = "fc-audio-player__icon--default",
}: {
  src: string;
  duration?: number;
  /** Tailwind class for the play button background, e.g. "bg-corner-backstory/20" */
  accentClass?: string;
  /** Tailwind class for icon color, e.g. "text-corner-backstory" */
  accentTextClass?: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(initDur || 0);
  const [cur, setCur] = useState(0);

  const toggle = useCallback(() => {
    if (!ref.current) return;
    if (playing) {
      ref.current.pause();
    } else {
      ref.current.play().catch(() => {});
    }
    setPlaying(!playing);
  }, [playing]);

  return (
    <div className="fc-audio-player">
      <button
        onClick={toggle}
        className={`fc-audio-player__btn ${accentClass}`}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg className={`w-3.5 h-3.5 ${accentTextClass}`} fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className={`w-3.5 h-3.5 ${accentTextClass}`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <input
        type="range"
        min={0}
        max={dur || 1}
        step={0.1}
        value={cur}
        aria-label="Audio progress"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          setCur(v);
          if (ref.current) ref.current.currentTime = v;
        }}
        className="fc-audio-player__scrubber"
      />
      <span className="fc-audio-player__time">{fmt(playing ? cur : dur)}</span>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => setDur(ref.current?.duration ?? 0)}
        onTimeUpdate={() => setCur(ref.current?.currentTime ?? 0)}
        onEnded={() => { setPlaying(false); setCur(0); }}
      />
    </div>
  );
}
