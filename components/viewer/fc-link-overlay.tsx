"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  FileText,
  Globe,
} from "lucide-react";
import type { Link } from "@/lib/field-registry";
import type { LinkPreviewData } from "@/app/api/link-preview/route";

export interface FCLinkOverlayProps {
  link: Link;
  preview: LinkPreviewData | null;
  isOpen: boolean;
  onClose: () => void;
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Full-screen overlay for previewing a link within the app.
 *
 * Strategy:
 * - If the API says `frameable !== false`, attempt an iframe embed first.
 * - If the iframe fails to load (timeout or error), fall back to the rich
 *   OG-metadata preview.
 * - A toggle in the header lets users switch between the live site and the
 *   summary preview at any time.
 * - If the API says `frameable === false`, skip the iframe entirely and
 *   show the rich preview.
 */
export function FCLinkOverlay({
  link,
  preview,
  isOpen,
  onClose,
}: FCLinkOverlayProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  // iframe states
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const iframeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Whether the API confirms the site allows iframes.
  // Treat undefined (API error/timeout) as blocked — only embed when
  // the server explicitly returned frameable: true.
  const confirmedFrameable = preview?.frameable === true;

  // View mode: "site" (iframe) or "preview" (OG metadata)
  // Default to "preview" unless we're confident the site allows framing
  const [viewMode, setViewMode] = useState<"site" | "preview">(
    confirmedFrameable ? "site" : "preview",
  );

  // Can we show the iframe right now?
  const showIframe = viewMode === "site" && confirmedFrameable && !iframeFailed;

  // Portal mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Reset state when overlay opens
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setImgError(false);
      setIframeLoaded(false);
      setIframeFailed(false);
      setViewMode(confirmedFrameable ? "site" : "preview");
    }
  }, [isOpen, confirmedFrameable]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Keyboard: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // iframe timeout — fall back to rich preview after 8s
  useEffect(() => {
    if (!isOpen || !showIframe || iframeLoaded) return;
    iframeTimerRef.current = setTimeout(() => {
      if (!iframeLoaded) {
        setIframeFailed(true);
        setViewMode("preview");
      }
    }, 8000);
    return () => { if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current); };
  }, [isOpen, showIframe, iframeLoaded]);

  const handleIframeLoad = useCallback(() => {
    if (iframeTimerRef.current) clearTimeout(iframeTimerRef.current);

    // X-Frame-Options blocked pages still fire onLoad but show a
    // blank error page. Try to detect the broken state by checking
    // if the frame navigated to about:blank or chrome-error://.
    try {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        const href = win.location.href;
        if (href === "about:blank" || href.startsWith("chrome-error://")) {
          setIframeFailed(true);
          setViewMode("preview");
          return;
        }
      }
    } catch {
      // SecurityError = cross-origin frame, which is expected for
      // a successfully loaded external site. This is the happy path.
    }

    setIframeLoaded(true);
  }, []);

  // Secondary check — some browsers render error pages that aren't
  // detectable via contentWindow immediately on load. Re-check after
  // a short delay to catch late-rendering error states.
  useEffect(() => {
    if (!iframeLoaded || iframeFailed) return;
    const check = setTimeout(() => {
      try {
        const win = iframeRef.current?.contentWindow;
        if (win) {
          const href = win.location.href;
          if (href === "about:blank" || href.startsWith("chrome-error://")) {
            setIframeFailed(true);
            setViewMode("preview");
          }
        }
      } catch {
        /* cross-origin = working */
      }
    }, 1500);
    return () => clearTimeout(check);
  }, [iframeLoaded, iframeFailed]);

  // Mobile swipe-to-dismiss
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, iframe")) return;
    dragStartY.current = e.clientY;
    setDragOffsetY(0);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.clientY - dragStartY.current;
    if (dy > 0) setDragOffsetY(dy);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (dragStartY.current === null) return;
    if (dragOffsetY > 80) onClose();
    dragStartY.current = null;
    setDragOffsetY(0);
  }, [dragOffsetY, onClose]);

  const handlePointerCancel = useCallback(() => {
    dragStartY.current = null;
    setDragOffsetY(0);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  }, [link.url]);

  const toggleView = useCallback(() => {
    setViewMode((v) => (v === "site" ? "preview" : "site"));
  }, []);

  if (!isMounted || !isOpen || !link.url) return null;

  const title = link.title || preview?.title || extractHostname(link.url);
  const description = preview?.description;
  const image = !imgError ? preview?.image : undefined;
  const favicon = preview?.favicon;
  const siteName = link.source || preview?.siteName;
  const domain = extractHostname(link.url);

  // Can the user toggle to the iframe view?
  const canToggleToSite = confirmedFrameable && !iframeFailed;

  const dragStyle =
    dragOffsetY > 0
      ? { transform: `translateY(${dragOffsetY}px)`, transition: "none" }
      : undefined;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fc-link-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={`Link preview: ${title}`}
        >
          {/* Backdrop */}
          <div className="fc-link-overlay__backdrop" onClick={onClose} />

          {/* Modal */}
          <motion.div
            className={`fc-link-overlay__modal${showIframe ? " fc-link-overlay__modal--iframe" : ""}`}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={dragStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {/* Mobile drag handle */}
            <div className="fc-link-overlay__drag-handle" aria-hidden="true">
              <div className="fc-link-overlay__drag-bar" />
            </div>

            {/* Header */}
            <div className="fc-link-overlay__header">
              <button
                type="button"
                className="fc-link-overlay__back"
                onClick={onClose}
                aria-label="Back to links"
              >
                <ArrowLeft size={18} />
                <span>Back</span>
              </button>

              <div className="fc-link-overlay__header-center">
                {favicon && (
                  <img
                    src={favicon}
                    alt=""
                    className="fc-link-overlay__favicon"
                    width={16}
                    height={16}
                  />
                )}
                <span className="fc-link-overlay__domain">{domain}</span>

                {/* View toggle — site vs preview */}
                {canToggleToSite && (
                  <button
                    type="button"
                    className="fc-link-overlay__toggle"
                    onClick={toggleView}
                    aria-label={
                      viewMode === "site"
                        ? "Show summary preview"
                        : "Show live site"
                    }
                    title={
                      viewMode === "site"
                        ? "Show summary"
                        : "Show live site"
                    }
                  >
                    {viewMode === "site" ? (
                      <FileText size={14} />
                    ) : (
                      <Globe size={14} />
                    )}
                  </button>
                )}
              </div>

              <button
                type="button"
                className="fc-link-overlay__close"
                onClick={onClose}
                aria-label="Close link preview"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content area */}
            <div className="fc-link-overlay__content">
              {showIframe ? (
                /* ── iframe embed ── */
                <div className="fc-link-overlay__iframe-wrap">
                  {!iframeLoaded && (
                    <div className="fc-link-overlay__loader">
                      <div className="fc-link-overlay__spinner" />
                      <span>Loading {domain}...</span>
                    </div>
                  )}
                  <iframe
                    ref={iframeRef}
                    src={preview?.embedUrl ?? link.url}
                    title={title}
                    className="fc-link-overlay__iframe"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                    referrerPolicy={preview?.embedUrl ? "strict-origin-when-cross-origin" : "no-referrer"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    onLoad={handleIframeLoad}
                    onError={() => {
                      setIframeFailed(true);
                      setViewMode("preview");
                    }}
                    style={{ opacity: iframeLoaded ? 1 : 0 }}
                  />
                </div>
              ) : (
                /* ── Rich preview fallback ── */
                <div className="fc-link-overlay__preview">
                  {image && (
                    <div className="fc-link-overlay__image-wrap">
                      <img
                        src={image}
                        alt={title}
                        className="fc-link-overlay__image"
                        onError={() => setImgError(true)}
                      />
                    </div>
                  )}

                  <div className="fc-link-overlay__meta">
                    {siteName && (
                      <span className="fc-link-overlay__site-name">
                        {siteName}
                      </span>
                    )}
                    <h2 className="fc-link-overlay__title">{title}</h2>
                    {description && (
                      <p className="fc-link-overlay__description">
                        {description}
                      </p>
                    )}
                    <span className="fc-link-overlay__url">{link.url}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="fc-link-overlay__footer">
              <button
                type="button"
                className="fc-link-overlay__action"
                onClick={handleCopy}
                aria-label={copied ? "Copied" : "Copy link"}
                title={copied ? "Copied" : "Copy link"}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>

              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="fc-link-overlay__action"
                aria-label="Open in new tab"
                title="Open in new tab"
              >
                <ExternalLink size={16} />
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
