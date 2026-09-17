"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import type { ShapeJSON } from "@fourcorners/canvas";
import * as THREE from "three";
import type { LinkPreviewData } from "@/app/api/link-preview/route";
import { isVideoUrl } from "@/lib/media-utils";

// ── link preview cache + lazy fetch hook ──

const linkPreviewCache = new Map<string, LinkPreviewData>();

function useLazyLinkPreview(url: string | undefined) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(
    url ? linkPreviewCache.get(url) ?? null : null,
  );
  // Initialize from props so setState doesn't run synchronously inside the
  // effect below (eslint react-hooks/set-state-in-effect would flag that).
  // Use an explicit narrowing ternary — Boolean(url) doesn't narrow string|undefined.
  const [loading, setLoading] = useState(() =>
    url ? !linkPreviewCache.has(url) : false,
  );
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!url || fetchedRef.current || linkPreviewCache.has(url)) return;
    fetchedRef.current = true;
    const ac = new AbortController();
    // loading is already true from the useState initializer above when
    // we have a url and no cache entry — no need to setState here, which
    // would also trip react-hooks/set-state-in-effect.
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal: ac.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data: LinkPreviewData | null) => {
        if (data) {
          linkPreviewCache.set(url, data);
          setPreview(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [url]);

  return { preview, loading };
}

// ── utilities ──

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── theme colors (subset needed for cards) ──

interface CardTheme {
  bg: string;
  text: string;
  textSecondary: string;
  border: string;
  surface: string;
}

const DARK_THEME: CardTheme = {
  bg: "#1a1a1a",
  text: "#f5f5f5",
  textSecondary: "#9a9a9a",
  border: "#2d2d2d",
  surface: "rgba(30, 30, 30, 0.92)",
};

const LIGHT_THEME: CardTheme = {
  bg: "#f8f7f5",
  text: "#111111",
  textSecondary: "#707070",
  border: "#e5e5e3",
  surface: "rgba(255, 255, 255, 0.92)",
};

// ── shared styles ──

const CARD_RADIUS = 9;
const FONT_FAMILY = '"Geist", system-ui, -apple-system, sans-serif';

function cardStyle(theme: CardTheme, width: number, accentColor?: string): React.CSSProperties {
  return {
    width,
    padding: "10px 12px",
    background: theme.surface,
    border: `1px solid ${accentColor || theme.border}`,
    borderRadius: CARD_RADIUS,
    fontFamily: FONT_FAMILY,
    color: theme.text,
    fontSize: 12,
    lineHeight: 1.4,
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
  };
}

// ── per-type renderers ──

function ZoneCard({ shape, theme }: { shape: ShapeJSON; theme: CardTheme }) {
  const color = (shape.data?.color as string) || "#666";
  const label = (shape.data?.label as string) || "Zone";
  const empty = !!shape.metadata?.empty;
  const corner = (shape.metadata?.corner as string) || "";

  const hints: Record<string, string> = {
    context: "Related images & video",
    links: "Sources & references",
    backstory: "The story behind it",
    cc: "Credit & copyright",
  };

  return (
    <div
      style={{
        width: empty ? 140 : 120,
        padding: empty ? "10px 12px" : "6px 10px",
        background: `${color}${empty ? "0a" : "11"}`,
        border: `1px ${empty ? "dashed" : "solid"} ${color}${empty ? "33" : "44"}`,
        borderRadius: CARD_RADIUS,
        fontFamily: FONT_FAMILY,
        textAlign: "center",
        cursor: empty ? "pointer" : "default",
      }}
    >
      <div style={{ color, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em" }}>
        {label}
      </div>
      {empty && hints[corner] && (
        <div style={{ color: theme.textSecondary, fontSize: 10, marginTop: 4, lineHeight: 1.3 }}>
          {hints[corner]}
        </div>
      )}
      {empty && (
        <div style={{ color, fontSize: 14, marginTop: 4, opacity: 0.4 }}>+</div>
      )}
    </div>
  );
}

/** Mobile zone header — wide, touch-friendly, with chevron toggle */
function ZoneCardMobile({
  shape,
  theme,
  isCollapsed,
  childCount,
}: {
  shape: ShapeJSON;
  theme: CardTheme;
  isCollapsed: boolean;
  childCount: number;
}) {
  const color = (shape.data?.color as string) || "#666";
  const label = (shape.data?.label as string) || "Zone";
  const empty = !!shape.metadata?.empty;

  return (
    <div
      style={{
        width: 380,
        minHeight: 48,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: `${color}${empty ? "08" : "14"}`,
        border: `1px ${empty ? "dashed" : "solid"} ${color}${empty ? "33" : "44"}`,
        borderRadius: CARD_RADIUS,
        fontFamily: FONT_FAMILY,
        cursor: "pointer",
      }}
    >
      {/* Color bar */}
      <div
        style={{
          width: 4,
          height: 24,
          borderRadius: 2,
          background: color,
          flexShrink: 0,
        }}
      />
      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
        </div>
        {!empty && (
          <div style={{ color: theme.textSecondary, fontSize: 10, marginTop: 2 }}>
            {childCount} item{childCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoCardContent({ shape, theme, width = 220 }: { shape: ShapeJSON; theme: CardTheme; width?: number }) {
  const url = (shape.data?.imageUrl as string) || "";
  const caption = (shape.data?.caption as string) || "";
  const isEmpty = !url;

  if (isEmpty) {
    return (
      <div
        style={{
          width,
          padding: "24px 16px",
          background: theme.surface,
          border: `2px dashed ${theme.border}`,
          borderRadius: CARD_RADIUS,
          fontFamily: FONT_FAMILY,
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <svg
          width="32" height="32" viewBox="0 0 24 24"
          fill="none" stroke={theme.textSecondary}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ margin: "0 auto 8px", display: "block", opacity: 0.5 }}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <div style={{ fontSize: 12, color: theme.text, fontWeight: 500, marginBottom: 4 }}>
          Start here
        </div>
        <div style={{ fontSize: 10, color: theme.textSecondary, lineHeight: 1.4 }}>
          Tap to add your photo
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle(theme, width), padding: 0, overflow: "hidden" }}>
      <img
        src={url}
        alt={caption}
        style={{
          width: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
      {caption && (
        <div style={{ padding: "8px 10px", fontSize: 11, color: theme.textSecondary, lineHeight: 1.3 }}>
          {caption.length > 120 ? caption.slice(0, 117) + "\u2026" : caption}
        </div>
      )}
    </div>
  );
}

function TextBlockContent({ shape, theme, width = 180 }: { shape: ShapeJSON; theme: CardTheme; width?: number }) {
  const content = (shape.data?.content as string) || "";

  return (
    <div style={cardStyle(theme, width)}>
      <div style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {content.length > 200 ? content.slice(0, 197) + "\u2026" : content}
      </div>
    </div>
  );
}

function LinkCardContent({ shape, theme, width = 160 }: { shape: ShapeJSON; theme: CardTheme; width?: number }) {
  const url = (shape.data?.url as string) || "";
  const title = (shape.data?.title as string) || url;
  const domain = (shape.data?.domain as string) || "";
  const { preview } = useLazyLinkPreview(url || undefined);
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{ ...cardStyle(theme, width), cursor: "pointer" }}
      onPointerUp={(e) => {
        const target = e.currentTarget as HTMLDivElement & { __didDrag?: boolean };
        if (url && !target.__didDrag) {
          e.stopPropagation();
          window.open(url, "_blank", "noopener");
        }
      }}
    >
      {/* Favicon + domain row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
        {preview?.favicon && (
          <img
            src={preview.favicon}
            alt=""
            width={14}
            height={14}
            style={{ borderRadius: 2, flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div style={{ fontSize: 10, color: theme.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {preview?.siteName || domain}
        </div>
      </div>

      {/* Title */}
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {preview?.title || (title.length > 40 ? title.slice(0, 37) + "\u2026" : title)}
      </div>

      {/* OG description */}
      {preview?.description && (
        <div style={{ fontSize: 10, color: theme.textSecondary, marginBottom: 4, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {preview.description}
        </div>
      )}

      {/* OG image */}
      {preview?.image && !imgError && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          onError={() => setImgError(true)}
          style={{ width: "100%", maxHeight: 80, objectFit: "cover", borderRadius: 4, marginTop: 2, display: "block" }}
        />
      )}
    </div>
  );
}

function VoiceNoteContent({ shape, theme, width = 180 }: { shape: ShapeJSON; theme: CardTheme; width?: number }) {
  const text = (shape.data?.transcriptionText as string) || "";
  const audioUrl = shape.data?.audioUrl as string | undefined;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const toggle = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing]);

  return (
    <div style={cardStyle(theme, width)}>
      {audioUrl && (
        <>
          {/* Mini player row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <button
              onPointerUp={toggle}
              style={{
                background: "none",
                border: "none",
                color: theme.text,
                cursor: "pointer",
                fontSize: 13,
                padding: 0,
                lineHeight: 1,
                touchAction: "manipulation",
                flexShrink: 0,
              }}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "\u23F8" : "\u25B6"}
            </button>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const t = parseFloat(e.target.value);
                setCurrentTime(t);
                if (audioRef.current) audioRef.current.currentTime = t;
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                height: 3,
                appearance: "none",
                WebkitAppearance: "none",
                background: theme.border,
                borderRadius: 2,
                outline: "none",
                cursor: "pointer",
                accentColor: theme.text,
              }}
            />
            <span style={{ fontSize: 9, color: theme.textSecondary, minWidth: 28, textAlign: "right", flexShrink: 0 }}>
              {formatTime(playing ? currentTime : duration)}
            </span>
          </div>
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onEnded={() => { setPlaying(false); setCurrentTime(0); }}
          />
        </>
      )}
      <div style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", color: theme.textSecondary }}>
        {text.length > 160 ? text.slice(0, 157) + "\u2026" : text}
      </div>
    </div>
  );
}

function ContextItemContent({ shape, theme, width = 120 }: { shape: ShapeJSON; theme: CardTheme; width?: number }) {
  const src = (shape.data?.imageSrc as string) || "";
  const caption = (shape.data?.caption as string) || "";
  const mediaType = shape.data?.mediaType as string | undefined;
  const isVideo = mediaType === "video" || (src && isVideoUrl(src));
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const toggleVideo = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!videoRef.current) return;
    if (videoPlaying) {
      videoRef.current.pause();
      setVideoPlaying(false);
    } else {
      videoRef.current.play().then(() => setVideoPlaying(true)).catch(() => {});
    }
  }, [videoPlaying]);

  return (
    <div style={{ ...cardStyle(theme, width), padding: 0, overflow: "hidden" }}>
      {src ? (
        isVideo ? (
          <div style={{ position: "relative" }}>
            <video
              ref={videoRef}
              src={src}
              playsInline
              preload="metadata"
              muted
              onEnded={() => setVideoPlaying(false)}
              style={{ width: "100%", display: "block", pointerEvents: "none" }}
            >
              {typeof shape.data?.mimeType === "string" && <source src={src} type={shape.data.mimeType} />}
            </video>
            {/* Play overlay */}
            <div
              onPointerUp={toggleVideo}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: videoPlaying ? "transparent" : "rgba(0,0,0,0.35)",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            >
              {!videoPlaying && (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white" opacity={0.9}>
                  <polygon points="6,3 20,12 6,21" />
                </svg>
              )}
            </div>
          </div>
        ) : (
          <img
            src={src}
            alt={caption}
            loading="lazy"
            style={{ width: "100%", display: "block", pointerEvents: "none" }}
          />
        )
      ) : (
        <div style={{ width: "100%", height: 90, background: "#374151" }} />
      )}
      {caption && (
        <div style={{ padding: "4px 8px", fontSize: 10, color: theme.textSecondary }}>
          {caption.length > 50 ? caption.slice(0, 47) + "\u2026" : caption}
        </div>
      )}
    </div>
  );
}

// ── drag threshold to distinguish tap from drag ──
const DRAG_THRESHOLD = 6; // px

// ── main ExploreCard ──

interface ExploreCardProps {
  shape: ShapeJSON;
  position: [number, number, number];
  colorMode: "dark" | "light";
  isMobile?: boolean;
  /** Parent zone color — used as border accent on child cards */
  cornerColor?: string;
  /** Hierarchy depth from d3-hierarchy (0 = root, 1 = zone, 2+ = child) */
  depth?: number;
  focused?: boolean;
  dimmed?: boolean;
  /** Mobile collapse state for zone cards */
  isCollapsed?: boolean;
  childCount?: number;
  onToggleCollapse?: (id: string) => void;
  onFocus?: (id: string) => void;
  onDragStart?: () => void;
  onDrag?: (id: string, pos: [number, number, number]) => void;
  onDragEnd?: () => void;
}

export function ExploreCard({
  shape,
  position,
  colorMode,
  isMobile = false,
  cornerColor,
  depth = 0,
  focused = false,
  dimmed = false,
  isCollapsed = false,
  childCount = 0,
  onToggleCollapse,
  onFocus,
  onDragStart,
  onDrag,
  onDragEnd,
}: ExploreCardProps) {
  const theme = colorMode === "dark" ? DARK_THEME : LIGHT_THEME;
  const groupRef = useRef<THREE.Group>(null);

  // Smooth position animation when siblings expand/collapse
  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const speed = 6;
    const alpha = 1 - Math.exp(-speed * delta);
    g.position.x += (position[0] - g.position.x) * alpha;
    g.position.y += (position[1] - g.position.y) * alpha;
    g.position.z += (position[2] - g.position.z) * alpha;
  });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const startXY = useRef<[number, number]>([0, 0]);
  const activePointerId = useRef<number | null>(null);
  const { camera, raycaster, gl } = useThree();

  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));

  // Project screen coords to 3D position on drag plane
  const screenTo3D = useCallback(
    (clientX: number, clientY: number): [number, number, number] | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const intersection = new THREE.Vector3();
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(dragPlane.current, intersection)) {
        return [intersection.x, intersection.y, position[2]];
      }
      return null;
    },
    [camera, raycaster, gl, position],
  );

  // Drag via real DOM pointer events on the Html wrapper — works on touch + mouse
  const handleWrapperPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Allow interactive child elements (buttons, links) to handle their own events
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "VIDEO" || tag === "INPUT") return;

      e.stopPropagation();
      e.preventDefault();

      activePointerId.current = e.pointerId;
      dragging.current = true;
      didDrag.current = false;
      startXY.current = [e.clientX, e.clientY];
      dragPlane.current.constant = -position[2];

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    },
    [position],
  );

  const handleWrapperPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current || e.pointerId !== activePointerId.current) return;
      e.stopPropagation();

      // Check drag threshold before committing to drag
      if (!didDrag.current) {
        const dx = e.clientX - startXY.current[0];
        const dy = e.clientY - startXY.current[1];
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        didDrag.current = true;
        onDragStart?.();
      }

      const pos = screenTo3D(e.clientX, e.clientY);
      if (pos) {
        onDrag?.(shape.id, pos);
      }
    },
    [screenTo3D, shape.id, onDrag, onDragStart],
  );

  const handleWrapperPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current || e.pointerId !== activePointerId.current) return;
      e.stopPropagation();

      const wasDrag = didDrag.current;
      dragging.current = false;
      didDrag.current = false;
      activePointerId.current = null;

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}

      if (wasDrag) {
        onDragEnd?.();
      } else {
        // Tap — toggle focus
        onFocus?.(shape.id);
      }
    },
    [onDragEnd, onFocus, shape.id],
  );

  const handleWrapperPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== activePointerId.current) return;
      dragging.current = false;
      didDrag.current = false;
      activePointerId.current = null;
      onDragEnd?.();
    },
    [onDragEnd],
  );

  // Mobile: all cards snap to viewport width
  const mw = isMobile ? 340 : 0; // 0 = use default per-type width

  // Render the appropriate card content
  let content: React.ReactNode;
  switch (shape.type) {
    case "zone":
      content = isMobile
        ? <ZoneCardMobile shape={shape} theme={theme} isCollapsed={isCollapsed} childCount={childCount} />
        : <ZoneCard shape={shape} theme={theme} />;
      break;
    case "photo-card":
      content = <PhotoCardContent shape={shape} theme={theme} width={mw || 220} />;
      break;
    case "text-block":
      content = <TextBlockContent shape={shape} theme={theme} width={mw || 180} />;
      break;
    case "link-card":
      content = <LinkCardContent shape={shape} theme={theme} width={mw || 160} />;
      break;
    case "voice-note":
      content = <VoiceNoteContent shape={shape} theme={theme} width={mw || 180} />;
      break;
    case "context-item":
      content = <ContextItemContent shape={shape} theme={theme} width={mw || 120} />;
      break;
    default:
      content = (
        <div style={cardStyle(theme, mw || 120)}>
          <div style={{ fontSize: 10, color: theme.textSecondary }}>{shape.type}</div>
        </div>
      );
  }

  // Depth-based visual layering: root/photo (0-1) are prominent,
  // zones (1-2) are mid-level, leaf children (2+) are subtler
  const depthScale = focused ? 1.15 : depth <= 1 ? 1 : 1 - Math.min(depth - 1, 3) * 0.03;
  const depthOpacity = dimmed ? 0.3 : depth <= 1 ? 1 : Math.max(0.75, 1 - (depth - 1) * 0.08);
  const shadowBlur = Math.max(2, 8 - depth * 2);
  const shadowAlpha = Math.max(0.15, 0.3 - depth * 0.05);

  return (
    <group ref={groupRef} position={position}>
      <Html
        transform
        distanceFactor={isMobile ? 7 : (focused ? 6 : 8)}
        style={{
          pointerEvents: "auto",
          touchAction: "none",
          userSelect: "none",
          opacity: depthOpacity,
          transition: "opacity 0.3s ease, transform 0.3s ease",
          transform: `scale(${depthScale})`,
          filter: focused
            ? "drop-shadow(0 0 12px rgba(9,255,240,0.4))"
            : `drop-shadow(0 ${Math.max(1, 3 - depth)}px ${shadowBlur}px rgba(0,0,0,${shadowAlpha}))`,
        }}
        zIndexRange={[10, 0]}
      >
        <div
          ref={wrapperRef}
          onPointerDown={handleWrapperPointerDown}
          onPointerMove={handleWrapperPointerMove}
          onPointerUp={handleWrapperPointerUp}
          onPointerCancel={handleWrapperPointerCancel}
          style={{
            cursor: "grab",
            touchAction: "none",
            ...(cornerColor && shape.type !== "zone"
              ? {
                  borderLeft: `3px solid ${cornerColor}`,
                  borderRadius: CARD_RADIUS,
                }
              : {}),
          }}
        >
          {content}
        </div>
      </Html>
    </group>
  );
}
