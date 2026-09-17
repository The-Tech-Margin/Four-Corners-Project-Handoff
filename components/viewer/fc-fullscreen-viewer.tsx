"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { X, ZoomIn, ZoomOut, RotateCw, Maximize2 } from "lucide-react";
import { FCPhotoViewer, type FCPhotoViewerData } from "./fc-photo-viewer";

interface FCFullscreenViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  imageAlt?: string;
  data: FCPhotoViewerData;
  projectContext?: {
    projectId?: string;
    projectSlug?: string;
  };
}

/**
 * Fullscreen viewer for optimal Four Corners metadata exploration.
 * Features:
 * - Pinch-to-zoom and pan on mobile
 * - Zoom controls
 * - Swipe down to close
 * - Full four corners interaction in isolation
 */
export function FCFullscreenViewer({
  isOpen,
  onClose,
  imageSrc,
  imageAlt = "Four Corners photograph",
  data,
  projectContext,
}: FCFullscreenViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom and position when opening
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Handle swipe down to close
  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (zoom === 1 && info.offset.y > 100 && info.velocity.y > 0) {
        onClose();
      }
    },
    [zoom, onClose]
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={containerRef}
          className="fc-fullscreen-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header with controls */}
          <div className="fc-fullscreen-header">
            <div className="fc-fullscreen-title">
              <Maximize2 size={18} />
              <span>Full Image View</span>
            </div>
            <div className="fc-fullscreen-controls">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                className="fc-fullscreen-btn"
                aria-label="Zoom out"
              >
                <ZoomOut size={20} />
              </button>
              <span className="fc-fullscreen-zoom-level">{Math.round(zoom * 100)}%</span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 4}
                className="fc-fullscreen-btn"
                aria-label="Zoom in"
              >
                <ZoomIn size={20} />
              </button>
              <button
                onClick={handleReset}
                className="fc-fullscreen-btn"
                aria-label="Reset view"
              >
                <RotateCw size={20} />
              </button>
              <button
                onClick={onClose}
                className="fc-fullscreen-btn fc-fullscreen-btn--close"
                aria-label="Close fullscreen view"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Main viewer area */}
          <motion.div
            className="fc-fullscreen-content"
            drag={zoom === 1}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDragEnd}
          >
            <div
              className="fc-fullscreen-image-wrapper"
              style={{
                transform: `scale(${zoom}) translate(${position.x}px, ${position.y}px)`,
                transformOrigin: "center center",
              }}
            >
              <FCPhotoViewer
                imageSrc={imageSrc}
                imageAlt={imageAlt}
                data={data}
                options={{ dark: true }}
                className="fc-fullscreen-viewer"
                projectContext={projectContext}
              />
            </div>
          </motion.div>

          {/* Mobile hint */}
          <div className="fc-fullscreen-hint">
            <span>Swipe down to close • Tap corners to explore metadata</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
