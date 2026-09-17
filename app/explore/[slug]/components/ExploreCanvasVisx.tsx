"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Repeat2 } from "lucide-react";
import type { HierarchyNode } from "d3-hierarchy";
import type { CanvasDocument, ShapeJSON } from "@fourcorners/canvas";
import { buildExploreHierarchy, type ExploreNode, type ExploreHierarchy } from "./use-explore-hierarchy";
import type { LinkPreviewData } from "@/app/api/link-preview/route";
import { useParentSize } from "@visx/responsive";

// ── link preview cache ──

const LP_CACHE_MAX = 200;
const lpCache = new Map<string, LinkPreviewData>();
function useLinkPreview(url: string | undefined) {
  const [p, setP] = useState<LinkPreviewData | null>(url ? lpCache.get(url) ?? null : null);
  useEffect(() => {
    if (!url || lpCache.has(url)) return;
    const ac = new AbortController();
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal: ac.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d: LinkPreviewData | null) => {
        if (d) {
          if (lpCache.size >= LP_CACHE_MAX) {
            const first = lpCache.keys().next().value;
            if (first !== undefined) lpCache.delete(first);
          }
          lpCache.set(url, d);
          setP(d);
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, [url]);
  return p;
}

function fmt(s: number): string {
  if (!s || !isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

// ── theme ──

interface T { bg: string; text: string; muted: string; border: string; surface: string; accent: string; grid: string }
const DARK: T = { bg: "#1a1a1a", text: "#f5f5f5", muted: "#9a9a9a", border: "#2d2d2d", surface: "rgba(30,30,30,0.92)", accent: "#09fff0", grid: "rgba(9,255,240,0.06)" };
const LIGHT: T = { bg: "#f8f7f5", text: "#111", muted: "#707070", border: "#e5e5e3", surface: "rgba(255,255,255,0.92)", accent: "#0d9488", grid: "rgba(13,148,136,0.08)" };

/**
 * Build the explore theme from `--fc-explore-*` CSS variables (set by the active
 * persona palette / globals.css), falling back to the hardcoded constants when a
 * variable is unset or we're rendering server-side. The computed values already
 * reflect the active dark/light mode, since `colorMode` mirrors the <html> class.
 */
function readExploreTheme(fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const s = getComputedStyle(document.documentElement);
  const v = (k: string, f: string) => s.getPropertyValue(k).trim() || f;
  return {
    bg: v("--fc-explore-bg", fallback.bg),
    surface: v("--fc-explore-surface", fallback.surface),
    border: v("--fc-explore-border", fallback.border),
    text: v("--fc-explore-text", fallback.text),
    muted: v("--fc-explore-muted", fallback.muted),
    accent: v("--fc-explore-accent", fallback.accent),
    grid: v("--fc-explore-grid", fallback.grid),
  };
}
const R = 3.76;
const FONT = '"Geist", system-ui, -apple-system, sans-serif';

function cs(t: T, accent?: string): React.CSSProperties {
  return { padding: "12px 14px", background: t.surface, borderWidth: 1, borderStyle: "solid", borderColor: accent || t.border, borderRadius: R, fontFamily: FONT, color: t.text, fontSize: 14, lineHeight: 1.5, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" };
}

// ── Shared interactive components ──

/** Full-screen image lightbox — click image to open, click/Esc to close */
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out",
      padding: 20,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- lightbox: stored media, fidelity-critical */}
      <img src={src} alt={alt} style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain" }} />
      <button onClick={onClose} aria-label="Close" style={{
        position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none",
        color: "#fff", fontSize: 24, width: 40, height: 40, borderRadius: 20, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>&times;</button>
    </div>
  );
}

/** Clickable image that opens a lightbox on click.
 *  Uses onPointerDown + stopPropagation to prevent DraggableNode from
 *  intercepting the click. Lightbox portals to document.body to escape SVG. */
function ZoomableImage({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  return (<>
    {/* eslint-disable-next-line @next/next/no-img-element -- stored media, fidelity-critical */}
    <img src={src} alt={alt} loading="lazy"
      onPointerDown={(e) => { e.stopPropagation(); }}
      onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      style={{ ...style, cursor: "zoom-in" }} />
    {open && typeof document !== "undefined" && createPortal(
      <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />,
      document.body,
    )}
  </>);
}

/** Compact inline audio player for fields with associated voice recordings */
function InlineAudio({ url, duration: initDur }: { url: string; duration?: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(initDur || 0);
  const [cur, setCur] = useState(0);
  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ref.current) return;
    if (playing) { ref.current.pause(); } else { ref.current.play().catch(() => {}); }
    setPlaying(!playing);
  }, [playing]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <button onPointerDown={(e) => e.stopPropagation()} onClick={toggle} aria-label={playing ? "Pause" : "Play voice recording"} style={{
        background: "none", border: "1px solid currentColor", color: "inherit", cursor: "pointer",
        fontSize: 11, padding: "3px 8px", borderRadius: 4, opacity: 0.7, whiteSpace: "nowrap",
      }}>{playing ? "\u23F8 Pause" : "\u25B6 Listen"}</button>
      <input type="range" min={0} max={dur || 1} step={0.1} value={cur} aria-label="Scrub"
        onChange={(e) => { const v = parseFloat(e.target.value); setCur(v); if (ref.current) ref.current.currentTime = v; }}
        style={{ flex: 1, height: 4, accentColor: "currentColor", cursor: "pointer" }} />
      <span style={{ fontSize: 10, opacity: 0.5, minWidth: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(playing ? cur : dur)}</span>
      <audio ref={ref} src={url} preload="metadata"
        onLoadedMetadata={() => setDur(ref.current?.duration ?? 0)}
        onTimeUpdate={() => setCur(ref.current?.currentTime ?? 0)}
        onEnded={() => { setPlaying(false); setCur(0); }} />
    </div>
  );
}

// ── Card renderers — NO truncation, all data visible, all media interactive ──

function ZoneNode({ s, t, cc, expanded, onToggle }: { s: ShapeJSON; t: T; cc: number; expanded?: boolean; onToggle?: () => void }) {
  const c = (s.data?.color as string) || "#666";
  const l = (s.data?.label as string) || "Zone";
  const empty = !!s.metadata?.empty;
  const interactive = !empty && onToggle;
  return (
    <div
      onClick={interactive ? onToggle : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } } : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-expanded={interactive ? expanded : undefined}
      style={{
        padding: "12px 20px", background: `${c}18`, border: `1px solid ${c}44`, borderRadius: R, fontFamily: FONT,
        cursor: interactive ? "pointer" : undefined,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}
    >
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={{ color: c, fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{l}</div>
        {!empty && <div style={{ color: t.muted, fontSize: 12, marginTop: 3 }}>{cc} item{cc !== 1 ? "s" : ""}{interactive ? (expanded ? " · tap to collapse" : " · tap to expand") : ""}</div>}
      </div>
      {interactive && (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: "transform 0.3s ease", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </div>
  );
}

function PhotoNode({ s, t }: { s: ShapeJSON; t: T }) {
  const url = (s.data?.imageUrl as string) || "";
  const caption = (s.data?.caption as string) || "";
  const credit = (s.data?.credit as string) || "";
  const date = (s.data?.date as string) || "";

  if (!url) return (
    <div style={{ ...cs(t), padding: "32px 20px", textAlign: "center", border: `2px dashed ${t.border}` }}>
      <div style={{ color: t.muted, fontSize: 14 }}>No photo</div>
    </div>
  );
  return (
    <div style={{ ...cs(t), padding: 0, overflow: "hidden" }}>
      <ZoomableImage src={url} alt={caption || "Project photo"} style={{ width: "100%", display: "block" }} />
      <div style={{ padding: "12px 14px" }}>
        {caption && <div style={{ fontSize: 14, color: t.text, lineHeight: 1.5, marginBottom: 6 }}>{caption}</div>}
        {credit && <div style={{ fontSize: 13, color: t.muted }}>{credit}</div>}
        {date && <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{date}</div>}
      </div>
    </div>
  );
}

function TextNode({ s, t }: { s: ShapeJSON; t: T }) {
  const content = (s.data?.content as string) || "";
  const fieldMapping = (s.data?.fieldMapping as string) || (s.metadata?.fieldMapping as string) || "";
  const audioUrl = (s.data?.audioUrl as string) || "";
  const audioDuration = (s.data?.audioDuration as number) || 0;

  // Parse label from "Label: content" or "Label\ncontent" format
  let label = "";
  let body = content;
  const colonIdx = content.indexOf(": ");
  const nlIdx = content.indexOf("\n");
  if (colonIdx > 0 && colonIdx < 40 && (nlIdx < 0 || colonIdx < nlIdx)) {
    label = content.slice(0, colonIdx);
    body = content.slice(colonIdx + 2);
  } else if (nlIdx > 0 && nlIdx < 40) {
    label = content.slice(0, nlIdx);
    body = content.slice(nlIdx + 1);
  }

  return (
    <div style={cs(t)}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>}
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, lineHeight: 1.55 }}>{body}</div>
      {audioUrl && <InlineAudio url={audioUrl} duration={audioDuration} />}
      {fieldMapping && <div style={{ fontSize: 10, color: t.muted, marginTop: 8, opacity: 0.5 }}>{fieldMapping.replace(".", " > ")}</div>}
    </div>
  );
}

function LinkNode({ s, t, focused, flipFront, compact }: { s: ShapeJSON; t: T; focused?: boolean; flipFront?: boolean; compact?: boolean }) {
  const url = (s.data?.url as string) || "";
  const title = (s.data?.title as string) || url;
  const domain = (s.data?.domain as string) || "";
  const p = useLinkPreview(url || undefined);

  // Compact front face for a flippable link card — favicon + source + title
  // only. The full rich preview (image, description, url) lives on the back so
  // the two faces differ, like the text-block compact-front pattern.
  if (compact) {
    return (
      <div style={{ ...cs(t), display: "flex", flexDirection: "column", gap: 6, minHeight: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny external favicon */}
          {p?.favicon && <img src={p.favicon} alt="" width={16} height={16} style={{ borderRadius: 2 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          <div style={{ fontSize: 12, color: t.muted }}>{p?.siteName || domain}</div>
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p?.title || title}</div>
      </div>
    );
  }

  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny external favicon */}
        {p?.favicon && <img src={p.favicon} alt="" width={16} height={16} style={{ borderRadius: 2 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
        <div style={{ fontSize: 12, color: t.muted }}>{p?.siteName || domain}</div>
      </div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, lineHeight: 1.4 }}>{p?.title || title}</div>
      {p?.description && <div style={{ fontSize: 13, color: t.muted, marginBottom: 6, lineHeight: 1.4 }}>{p.description}</div>}
      {p?.image && <ZoomableImage src={p.image} alt={p.title || "Link preview"} style={{ width: "100%", objectFit: "cover", marginTop: 4, display: "block" }} />}
    </>
  );

  // Flip-front variant: the card body is the flip target (the FlipCard wrapper
  // handles clicks); only the URL line stays a real link so it still opens.
  if (flipFront) {
    return (
      <div style={{ ...cs(t), display: "block", color: t.text }}>
        {inner}
        <a href={url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ fontSize: 12, color: t.accent, marginTop: 8, wordBreak: "break-all", display: "block", textDecoration: "underline" }}>
          {url}
        </a>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      onPointerDown={(e) => { if (focused) e.stopPropagation(); }}
      onClick={(e) => { if (!focused) e.preventDefault(); }}
      style={{ ...cs(t), cursor: focused ? "pointer" : "default", textDecoration: "none", display: "block", color: t.text }}>
      {inner}
      <div style={{ fontSize: 12, color: t.accent, marginTop: 8, wordBreak: "break-all" }}>{url}</div>
    </a>
  );
}

function VoiceNode({ s, t }: { s: ShapeJSON; t: T }) {
  const text = (s.data?.transcriptionText as string) || "";
  const audioUrl = s.data?.audioUrl as string | undefined;
  const duration = (s.data?.duration as number) || 0;
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(duration);
  const [cur, setCur] = useState(0);
  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ref.current) return;
    if (playing) { ref.current.pause(); } else { ref.current.play().catch(() => {}); }
    setPlaying(!playing);
  }, [playing]);

  return (
    <div style={cs(t)}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Voice Note</div>
      {audioUrl && (
        <div
          // Player interactions (play, seek) must never flip the parent card.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 0" }}
        >
          <button onPointerDown={(e) => e.stopPropagation()} onClick={toggle} style={{ background: t.accent, border: "none", color: t.bg, cursor: "pointer", fontSize: 14, padding: "6px 10px", borderRadius: 6, fontWeight: 600 }} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "\u23F8 Pause" : "\u25B6 Play"}
          </button>
          <input type="range" min={0} max={dur || 1} step={0.1} value={cur} aria-label="Audio scrubber"
            onChange={(e) => { const v = parseFloat(e.target.value); setCur(v); if (ref.current) ref.current.currentTime = v; }}
            style={{ flex: 1, height: 6, accentColor: t.accent, cursor: "pointer" }} />
          <span style={{ fontSize: 12, color: t.muted, minWidth: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(playing ? cur : dur)}</span>
          <audio ref={ref} src={audioUrl} preload="metadata"
            onLoadedMetadata={() => setDur(ref.current?.duration ?? 0)}
            onTimeUpdate={() => setCur(ref.current?.currentTime ?? 0)}
            onEnded={() => { setPlaying(false); setCur(0); }} />
        </div>
      )}
      {text && <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.55, color: t.text }}>{text}</div>}
    </div>
  );
}

function ContextNode({ s, t }: { s: ShapeJSON; t: T }) {
  const src = (s.data?.imageSrc as string) || "";
  const cap = (s.data?.caption as string) || "";
  const mediaType = (s.data?.mediaType as string) || "image";
  const audioUrl = (s.data?.audioUrl as string) || "";
  const audioDuration = (s.data?.audioDuration as number) || 0;
  const isVideo = mediaType === "video" || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(src);

  return (
    <div style={{ ...cs(t), padding: 0, overflow: "hidden" }}>
      {src ? (
        isVideo ? (
          <video src={src} controls playsInline preload="metadata"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ width: "100%", display: "block", background: "#000" }} />
        ) : (
          <ZoomableImage src={src} alt={cap || "Context image"} style={{ width: "100%", display: "block" }} />
        )
      ) : (
        <div style={{ width: "100%", height: 120, background: "#374151", display: "flex", alignItems: "center", justifyContent: "center", color: t.muted, fontSize: 13 }}>No media</div>
      )}
      <div style={{ padding: cap || audioUrl ? "8px 14px" : 0 }}>
        {cap && <div style={{ fontSize: 13, color: t.text, lineHeight: 1.4 }}>{cap}</div>}
        {audioUrl && <InlineAudio url={audioUrl} duration={audioDuration} />}
      </div>
    </div>
  );
}

function NodeCard({ s, t, h, focused }: { s: ShapeJSON; t: T; h: ExploreHierarchy | null; focused?: boolean }) {
  const cc = h?.childrenOf.get(s.id)?.length ?? 0;
  const ac = h?.cornerColorOf.get(s.id);
  const bdr = ac && s.type !== "zone" ? { borderLeft: `3px solid ${ac}` } : {};
  return <div style={bdr}>{
    s.type === "zone" ? <ZoneNode s={s} t={t} cc={cc} /> :
    s.type === "photo-card" ? <PhotoNode s={s} t={t} /> :
    s.type === "text-block" ? <TextNode s={s} t={t} /> :
    s.type === "link-card" ? <LinkNode s={s} t={t} focused={focused} /> :
    s.type === "voice-note" ? <VoiceNode s={s} t={t} /> :
    s.type === "context-item" ? <ContextNode s={s} t={t} /> :
    <div style={cs(t)}><div style={{ fontSize: 13, color: t.muted }}>{s.type}</div></div>
  }</div>;
}

function haptic() { try { navigator.vibrate?.(10); } catch {} }

// ══════════════════════════════════════════════════════════════
// MOBILE LAYOUT — native scrollable HTML, no SVG zoom
// Cards render at full readable size, user scrolls naturally.
// ══════════════════════════════════════════════════════════════

/**
 * Parse a text-block's content into a label + body using the established
 * "LABEL: value" / first-line conventions from the transform layer.
 */
function splitContent(content: string, fallbackLabel: string): { label: string; body: string } {
  const colonIdx = content.indexOf(": ");
  const nlIdx = content.indexOf("\n");
  if (colonIdx > 0 && colonIdx < 40 && (nlIdx < 0 || colonIdx < nlIdx)) {
    return { label: content.slice(0, colonIdx), body: content.slice(colonIdx + 2) };
  }
  if (nlIdx > 0 && nlIdx < 40) {
    return { label: content.slice(0, nlIdx), body: content.slice(nlIdx + 1) };
  }
  return { label: fallbackLabel, body: content };
}

/** Compact front face for flippable cards — shows type icon + label */
function CardFront({ s, t, cornerColor }: { s: ShapeJSON; t: T; cornerColor?: string }) {
  const content = (s.data?.content as string) || "";
  const { label, body } = splitContent(content, s.type.replace("-", " "));
  const preview = body.slice(0, 80);
  const color = cornerColor || t.accent;

  return (
    <div style={{
      ...cs(t), display: "flex", flexDirection: "column", gap: 6,
      borderLeftWidth: 3, borderLeftColor: color, minHeight: 60,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color }}>{label}</div>
      {preview && <div style={{ fontSize: 13, color: t.muted, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{preview}</div>}
    </div>
  );
}

/**
 * Generic animated flip card: 0.5s rotateX, hover lift (CSS .fc-flip-card),
 * and a hover-revealed flip icon (.fc-flip-badge) replacing the old
 * "Tap to expand" text. The badge floats above both faces so flipping back is
 * always possible — including over iframe backs, which swallow card clicks.
 */
function FlipCard({ front, back, flipped, onToggle, label, t }: {
  front: React.ReactNode; back: React.ReactNode; flipped: boolean;
  onToggle: () => void; label: string; t: T;
}) {
  return (
    <div
      className="fc-flip-card"
      role="button"
      tabIndex={0}
      aria-expanded={flipped}
      aria-label={`${label} — press to flip`}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggle(); } }}
      style={{ perspective: 800, cursor: "pointer", position: "relative" }}
    >
      <button
        type="button"
        className="fc-flip-badge"
        aria-hidden="true"
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{ color: t.muted }}
      >
        <Repeat2 size={14} />
      </button>
      <div style={{
        transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        transformStyle: "preserve-3d",
        transform: flipped ? "rotateX(180deg)" : "rotateX(0)",
      }}>
        {/* Only the VISIBLE face stays in normal flow, so the card always
            fits its current content height — the hidden face is absolute.
            `inert` + aria-hidden keep the hidden face out of the a11y tree and
            tab order, so SRs/keyboard only reach the face that's showing. */}
        <div
          aria-hidden={flipped}
          inert={flipped}
          style={{
            backfaceVisibility: "hidden",
            position: flipped ? "absolute" : "relative",
            top: flipped ? 0 : undefined,
            left: flipped ? 0 : undefined,
            width: "100%",
          }}>{front}</div>
        <div
          aria-hidden={!flipped}
          inert={!flipped}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateX(180deg)",
            position: flipped ? "relative" : "absolute",
            top: flipped ? undefined : 0,
            left: flipped ? undefined : 0,
            width: "100%",
          }}>{back}</div>
      </div>
    </div>
  );
}

/**
 * One zone child, with per-type flip behavior:
 *  - text-block (long): compact front → full text back
 *  - voice-note: player + transcription on the FRONT; back is a random image
 *    from the project, re-rolled on every flip (no images → no flip)
 *  - link-card: preview front → embedded player back when the server says the
 *    URL is frameable (reuses /api/link-preview's frameable/embedUrl, the same
 *    plumbing as the 4C panels' FCLinkOverlay); not frameable → plain card
 *  - everything else renders directly
 */
function ZoneChildCard({ s, t, h, projectImages }: {
  s: ShapeJSON; t: T; h: ExploreHierarchy | null; projectImages: string[];
}) {
  const [flipped, setFlipped] = useState(false);
  const [backImg, setBackImg] = useState<string | null>(null);
  const isLink = s.type === "link-card";
  const url = isLink ? ((s.data?.url as string) || "") : "";
  const p = useLinkPreview(url || undefined);
  const cornerColor = h?.cornerColorOf.get(s.id);

  // Links flip whenever there's something richer to reveal: an embeddable site
  // (iframe) or, for the common case of sites that forbid framing, a rich
  // preview (og image + description) on the back.
  const flippable =
    s.type === "text-block" ? true :
    s.type === "voice-note" ? projectImages.length > 0 :
    isLink ? (p?.frameable === true || !!p?.embedUrl || !!p?.image) :
    false;

  const toggle = useCallback(() => {
    haptic();
    setFlipped((f) => {
      const next = !f;
      if (next && s.type === "voice-note" && projectImages.length > 0) {
        setBackImg(projectImages[Math.floor(Math.random() * projectImages.length)]);
      }
      return next;
    });
  }, [s.type, projectImages]);

  if (!flippable) return <NodeCard s={s} t={t} h={h} />;

  const front =
    s.type === "text-block" ? <CardFront s={s} t={t} cornerColor={cornerColor} /> :
    s.type === "voice-note" ? <VoiceNode s={s} t={t} /> :
    <LinkNode s={s} t={t} compact />;

  // A real iframe only works when the site allows framing; otherwise the back
  // is the full rich preview (the og image now loads — no CORS crossOrigin).
  const linkEmbeddable = isLink && (p?.frameable === true || !!p?.embedUrl);

  const back =
    s.type === "text-block" ? <NodeCard s={s} t={t} h={h} /> :
    s.type === "voice-note" ? (
      backImg ? (
        // Plain <img>, not ZoomableImage — a tap anywhere should flip back.
        // eslint-disable-next-line @next/next/no-img-element -- project media URLs
        <img src={backImg} alt="A random image from this project" style={{ width: "100%", display: "block", borderRadius: 12, objectFit: "cover" }} />
      ) : null
    ) : linkEmbeddable ? (
      // Video embeds are 16:9; plain frameable sites get a fixed usable
      // height (a webpage has no natural aspect ratio).
      <div style={{
        ...(p?.embedUrl ? { aspectRatio: "16 / 9" } : { height: 480 }),
        background: "#000", borderRadius: 12, overflow: "hidden",
      }}>
        {/* Lazy: the iframe mounts only while flipped (FCLinkOverlay's approach) */}
        {flipped && (
          <iframe
            src={p?.embedUrl ?? url}
            title={p?.title || url || "Embedded link"}
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        )}
      </div>
    ) : (
      // Site forbids framing: show the full rich preview (image + description).
      <LinkNode s={s} t={t} flipFront />
    );

  const label =
    s.type === "voice-note" ? "voice note" :
    isLink ? (p?.title || "link") :
    splitContent((s.data?.content as string) || "", "note").label;

  return <FlipCard front={front} back={back} flipped={flipped} onToggle={toggle} label={label} t={t} />;
}

/**
 * A "short fact" is a text-block whose body is a one-liner (Author, Date…).
 * Flipping these is useless — the front and back show the same thing — so
 * a zone's facts consolidate into one FactsCard instead.
 */
function isShortFact(s: ShapeJSON): boolean {
  if (s.type !== "text-block") return false;
  const { body } = splitContent((s.data?.content as string) || "", "");
  return body.length <= 80 && !body.includes("\n");
}

/** One consolidated card listing a zone's short facts as label/value rows. */
function FactsCard({ shapes, t, cornerColor }: { shapes: ShapeJSON[]; t: T; cornerColor?: string }) {
  const color = cornerColor || t.accent;
  return (
    <div style={{
      ...cs(t), display: "flex", flexDirection: "column", gap: 10,
      borderLeftWidth: 3, borderLeftColor: color,
    }}>
      {shapes.map((s) => {
        // Empty fallback: unlabelled facts show just their value rather than
        // a raw type name like "text-block".
        const { label, body } = splitContent((s.data?.content as string) || "", "");
        return (
          <div key={s.id} data-node-id={s.id}>
            {label && <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color, marginBottom: 2 }}>{label}</div>}
            <div style={{ fontSize: 14, color: t.text, lineHeight: 1.4 }}>{body}</div>
          </div>
        );
      })}
    </div>
  );
}

function MobileExploreView({ doc, t, hierarchy, shapeMap }: {
  doc: CanvasDocument; t: T; hierarchy: ExploreHierarchy | null; shapeMap: Map<string, ShapeJSON>;
}) {
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());

  // Pool of project images for the voice-card flip backs (photo + image-type
  // context items).
  const projectImages = useMemo(() => {
    const urls: string[] = [];
    for (const s of doc.shapes) {
      if (s.type === "photo-card") {
        const u = s.data?.imageUrl as string | undefined;
        if (u) urls.push(u);
      }
      if (s.type === "context-item") {
        const mt = (s.data?.mediaType as string) || "image";
        const u = s.data?.imageSrc as string | undefined;
        if (u && mt !== "video" && !/\.(mp4|webm|ogg|mov)(\?|$)/i.test(u)) urls.push(u);
      }
    }
    return urls;
  }, [doc.shapes]);

  const toggleZone = useCallback((id: string) => {
    haptic();
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Hide ALL zone children from the top-level list — they render inside their parent zone
  const zoneChildIds = useMemo(() => {
    const hidden = new Set<string>();
    if (!hierarchy) return hidden;
    for (const zoneId of hierarchy.zoneIds) {
      const childIds = hierarchy.childrenOf.get(zoneId);
      if (childIds) childIds.forEach(id => hidden.add(id));
    }
    return hidden;
  }, [hierarchy]);

  const orderedNodes = useMemo(() => {
    if (!hierarchy) return [];
    const list: { id: string; depth: number; shape: ShapeJSON }[] = [];
    hierarchy.root.eachBefore((n: HierarchyNode<ExploreNode>) => {
      if (n.data.id === "__root__") return;
      const s = shapeMap.get(n.data.id);
      if (s) list.push({ id: n.data.id, depth: n.depth, shape: s });
    });
    return list;
  }, [hierarchy, shapeMap]);

  return (
    <div style={{
      width: "100%", height: "auto", overflowX: "hidden",
      background: t.bg, padding: "12px 16px 80px",
    }}>
      <div style={{ maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {(() => {
          const elements: React.ReactNode[] = [];
          let i = 0;
          while (i < orderedNodes.length) {
            const n = orderedNodes[i];

            // Skip children that are rendered inside their expanded parent zone
            if (zoneChildIds.has(n.id)) { i++; continue; }

            const cornerColor = hierarchy?.cornerColorOf.get(n.id);
            const isChild = n.depth > 1;

            // Zone nodes — expand inline to show all children
            if (n.shape.type === "zone") {
              const childCount = hierarchy?.childrenOf.get(n.id)?.length ?? 0;
              const isExpanded = expandedZones.has(n.id);
              const empty = !!n.shape.metadata?.empty;
              // Empty sections add nothing in the list — skip entirely.
              if (empty || childCount === 0) { i++; continue; }
              const childIds = hierarchy?.childrenOf.get(n.id) || [];
              const childShapes = childIds.map(id => shapeMap.get(id)).filter((s): s is ShapeJSON => !!s);

              elements.push(
                <div
                  key={n.id}
                  data-node-id={n.id}
                  style={{
                    marginLeft: isChild ? 16 + (n.depth - 2) * 8 : 0,
                    borderRadius: R,
                    animation: `fc-gallery-fade-in 400ms ease both`,
                    animationDelay: `${(elements.length) * 60}ms`,
                  }}
                >
                  <ZoneNode s={n.shape} t={t} cc={childCount}
                    expanded={isExpanded}
                    onToggle={!empty ? () => toggleZone(n.id) : undefined}
                  />
                  {isExpanded && childShapes.length > 0 && (
                    <div style={{
                      marginTop: 8, display: "flex", flexDirection: "column", gap: 10,
                      paddingLeft: 8,
                    }}>
                      {/* Short one-line facts (Author, Date…) consolidate into
                          ONE card — flipping them shows nothing new. */}
                      {(() => {
                        const facts = childShapes.filter(isShortFact);
                        if (facts.length === 0) return null;
                        return (
                          <div style={{ animation: `fc-gallery-fade-in 300ms ease both` }}>
                            <FactsCard
                              shapes={facts}
                              t={t}
                              cornerColor={hierarchy?.cornerColorOf.get(facts[0].id)}
                            />
                          </div>
                        );
                      })()}
                      {childShapes.filter((c) => !isShortFact(c)).map((child, ci) => (
                        <div key={child.id} data-node-id={child.id} style={{
                          animation: `fc-gallery-fade-in 300ms ease both`,
                          animationDelay: `${ci * 60}ms`,
                        }}>
                          <ZoneChildCard s={child} t={t} h={hierarchy} projectImages={projectImages} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>,
              );
              i++;
              continue;
            }

            // Photo card — render directly
            if (n.shape.type === "photo-card") {
              elements.push(
                <div
                  key={n.id}
                  data-node-id={n.id}
                  role="treeitem"
                  tabIndex={0}
                  aria-selected={false}
                  aria-label={`photo: ${(n.shape.data?.caption as string) || "Project photo"}`}
                  style={{
                    borderRadius: R,
                    animation: `fc-gallery-fade-in 400ms ease both`,
                    animationDelay: `${(elements.length) * 60}ms`,
                  }}
                >
                  <NodeCard s={n.shape} t={t} h={hierarchy} />
                </div>,
              );
              i++;
              continue;
            }

            // All other cards (text-block, voice-note, link-card, context-item)
            // rendered directly when not inside an expanded zone
            elements.push(
              <div
                key={n.id}
                data-node-id={n.id}
                role="treeitem"
                tabIndex={0}
                aria-selected={false}
                aria-label={`${n.shape.type}: ${(n.shape.data?.label as string) || (n.shape.data?.caption as string) || (n.shape.data?.title as string) || n.shape.type}`}
                style={{
                  marginLeft: isChild ? 16 + (n.depth - 2) * 8 : 0,
                  borderLeft: cornerColor ? `3px solid ${cornerColor}` : undefined,
                  borderRadius: R,
                  animation: `fc-gallery-fade-in 400ms ease both`,
                  animationDelay: `${(elements.length) * 60}ms`,
                }}
              >
                <NodeCard s={n.shape} t={t} h={hierarchy} />
              </div>,
            );
            i++;
          }
          return elements;
        })()}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN — explore renders the scrollable card list at every width.
// (The former desktop SVG tree/force graph was removed — the list is
// the single explore implementation, embedded as a view-page tab.)
// ══════════════════════════════════════════════════════════════

interface Props { document: CanvasDocument; colorMode: "dark" | "light" }

function ExploreCanvasInner({ document: doc, colorMode }: Props) {
  const { parentRef, width: vpW } = useParentSize<HTMLDivElement>({ debounceTime: 100 });
  // Read --fc-explore-* from the live document, so palette overrides drive the
  // explore theme. Recomputes when the mode flips (colorMode mirrors the <html>
  // class). Falls back to the hardcoded constants (also the SSR value) when the
  // variables are unset.
  const t = useMemo(
    () => readExploreTheme(colorMode === "dark" ? DARK : LIGHT),
    [colorMode],
  );

  const hierarchy = useMemo(() => buildExploreHierarchy(doc.shapes, doc.connections), [doc.shapes, doc.connections]);
  const shapeMap = useMemo(() => { const m = new Map<string, ShapeJSON>(); for (const s of doc.shapes) m.set(s.id, s); return m; }, [doc.shapes]);

  return (
    <div ref={parentRef} style={{ width: "100%", height: "auto", background: t.bg, position: "relative" }}>
      {vpW === 0 ? null : <MobileExploreView doc={doc} t={t} hierarchy={hierarchy} shapeMap={shapeMap} />}
    </div>
  );
}

export const ExploreCanvas = memo(ExploreCanvasInner);
