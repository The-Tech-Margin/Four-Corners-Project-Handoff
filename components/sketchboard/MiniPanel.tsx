"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import {
  CORNER_LABELS,
  CORNER_DESCRIPTIONS,
  CORNER_COLORS_CSS,
} from "./shapes/types";
import type { CornerAffinity } from "./shapes/types";
import { EthicsControls } from "./mini-panels/EthicsControls";
import { LicenseSelector } from "./mini-panels/LicenseSelector";
import { ContextUploader } from "./mini-panels/ContextUploader";
import { LinkAdder } from "./mini-panels/LinkAdder";
import { useSwipeToDismiss } from "@/hooks/use-swipe-dismiss";

export interface MiniPanelState {
  zone: NonNullable<CornerAffinity>;
  /** Screen-space anchor position for desktop positioning */
  anchorPos: { x: number; y: number };
}

interface MiniPanelProps {
  state: MiniPanelState;
  onClose: () => void;
}

export function MiniPanel({ state, onClose }: MiniPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useSwipeToDismiss(panelRef, onClose);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => window.addEventListener("mousedown", handler), 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const label = CORNER_LABELS[state.zone] || state.zone.toUpperCase();
  const desc = CORNER_DESCRIPTIONS[state.zone] || "";
  const accent = CORNER_COLORS_CSS[state.zone] || "var(--fc-accent)";

  return (
    <div
      ref={panelRef}
      className="fc-mini-panel"
      style={{
        "--zone-accent": accent,
      } as React.CSSProperties}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="fc-panel-handle" />
      <div className="fc-mini-panel__header">
        <div className="fc-zone-panel__title">
          <span className="fc-zone-panel__dot" style={{ background: accent }} />
          <span>{label}</span>
        </div>
        <span className="fc-zone-panel__desc">{desc}</span>
        <button onClick={onClose} className="fc-zone-panel__close" aria-label="Close panel">
          <X size={16} />
        </button>
      </div>

      <div className="fc-mini-panel__body">
        {state.zone === "backstory" && (
          <p className="fc-zone-empty">Click text shapes to edit inline</p>
        )}
        {state.zone === "cc" && (
          <>
            <LicenseSelector />
            <div className="fc-zone-field__divider" />
            <EthicsControls />
          </>
        )}
        {state.zone === "context" && <ContextUploader />}
        {state.zone === "links" && <LinkAdder />}
      </div>
    </div>
  );
}
