"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/**
 * Chrome refuses to load `data:video/quicktime;…` on a <video> element —
 * MediaError.code === 4 ("Unable to load URL due to content type") even
 * when the underlying byte stream is an MP4-compatible QuickTime container
 * (.mov files use the same ISO base media file format as .mp4, with a
 * different `ftyp` brand). Other browsers including Safari accept the
 * QuickTime MIME but Chrome's data-URL allowlist doesn't.
 *
 * Rewriting the MIME label to `video/mp4` lets Chrome decode the same bytes
 * via its H.264 path. Safari ignores the label and decodes by content
 * anyway. This is purely a display-side fix — uploads still preserve the
 * original `video/quicktime` MIME for storage.
 *
 * Only rewrites `data:` URLs. Storage URLs (no explicit MIME on the URL
 * itself; Content-Type comes from the response header storage sets) are
 * passed through untouched.
 */
function normalizeVideoSrc(src: string): string {
  if (!src.startsWith("data:video/quicktime")) return src;
  return src.replace(/^data:video\/quicktime/, "data:video/mp4");
}

/**
 * Primary-image video shell with a center-of-frame play/pause button.
 *
 * Native <video controls> draws a horizontal bar across the bottom that
 * (a) covers the bottom corner buttons and (b) clashes visually with the
 * Four Corners interaction model. This component hides the native chrome
 * and replaces it with a single play/pause toggle that fades in on hover
 * and stays visible whenever the video is paused.
 *
 * Used by both the editor preview (InteractiveImagePreview) and the
 * public viewer (FCPhotoViewer) so the behavior is identical in both
 * places.
 */
export function VideoPrimary({
  src,
  poster,
  className,
  onLoadedMetadata,
  fillParent = false,
}: {
  src: string;
  poster?: string;
  className?: string;
  onLoadedMetadata?: () => void;
  /**
   * Wrapper sizing strategy. The play-button overlay needs a positioned
   * parent, but the parent's right sizing depends on the call site:
   *
   *  - `false` (default): wrapper is `inline-block` so it shrinks to the
   *    <video>'s intrinsic dimensions. Right for `.fc-image-wrapper` and
   *    other `width: fit-content` parents (FCPhotoViewer).
   *
   *  - `true`: wrapper is `relative w-full h-full` so the <video> can
   *    `w-full h-full object-cover` fill an explicitly-sized parent.
   *    Right for `absolute inset-0` containers (InteractiveImagePreview).
   *
   * Mixing these up makes the wrapper collapse to either zero-size (no
   * video visible) or the 300×150 default <video> box (play button
   * stranded in the corner of a larger container).
   */
  fillParent?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const normalizedSrc = useMemo(() => normalizeVideoSrc(src), [src]);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  // Button is visible when paused (so users see how to start) or on hover
  // (so they can pause without the cursor having to find a thin scrubber).
  const showOverlay = !playing || hovered;

  return (
    <div
      className={
        fillParent ? "relative w-full h-full" : "relative inline-block"
      }
      style={fillParent ? undefined : { lineHeight: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <video
        ref={ref}
        src={normalizedSrc}
        poster={poster}
        playsInline
        preload="metadata"
        className={className}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={onLoadedMetadata}
        onContextMenu={(e) => e.preventDefault()}
        onClick={toggle}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause video" : "Play video"}
        className="absolute inset-0 flex items-center justify-center bg-transparent border-0 cursor-pointer transition-opacity duration-200"
        style={{
          opacity: showOverlay ? 1 : 0,
          pointerEvents: showOverlay ? "auto" : "none",
        }}
      >
        <span
          className="flex items-center justify-center rounded-full"
          style={{
            width: 64,
            height: 64,
            // Theme-driven backdrop + foreground; both tokens live in
            // :root and html.light in globals.css. Overlay stays dark in
            // both themes so the icon is readable over any video content.
            background: "var(--fc-overlay-strong)",
            color: "var(--fc-on-overlay)",
            backdropFilter: "blur(4px)",
          }}
        >
          {playing ? <Pause size={28} /> : <Play size={28} fill="currentColor" />}
        </span>
      </button>
    </div>
  );
}
