"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CanvasDocument, ShapeJSON } from "@fourcorners/canvas";
import { storeToCanvasDocument } from "@/hooks/use-canvas-bridge";
import { useFourCornersStore } from "@/lib/store";
import { ZonePanel } from "./ZonePanel";
import { MiniPanel } from "./MiniPanel";
import type { MiniPanelState } from "./MiniPanel";
// InlineEditOverlay disabled until 3D screen projection is implemented
import type { CornerAffinity } from "./shapes/types";
import type { AutosaveStatus } from "@/hooks/useAutosave";
import { SketchboardToolbar } from "./SketchboardToolbar";
import { getPreset } from "./presets";

// SSR-disabled 3D canvas (needs WebGL)
const FlowCanvas3D = dynamic(
  () => import("@/app/explore/[slug]/components/FlowCanvas3D").then((m) => m.FlowCanvas3D),
  { ssr: false },
);

/** Interaction state machine */
type InteractionState =
  | { mode: "idle" }
  | { mode: "mini-panel"; state: MiniPanelState }
  | { mode: "full-panel"; zone: NonNullable<CornerAffinity> };

interface CanvasEditor3DProps {
  isReadOnly: boolean;
  autosaveStatus: AutosaveStatus;
  lastAutosaveError: string | null;
  isPublished: boolean;
  inGallery: boolean;
  onExport: () => void;
  onImport: () => void;
}

export default function CanvasEditor3D({
  isReadOnly,
  autosaveStatus,
  lastAutosaveError,
  onExport,
}: CanvasEditor3DProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [interaction, setInteraction] = useState<InteractionState>({ mode: "idle" });
  const [panelExiting, setPanelExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [colorMode, setColorMode] = useState<"dark" | "light">("dark");
  const [doc, setDoc] = useState<CanvasDocument | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const setLayoutMode = useFourCornersStore((s) => s.setLayoutMode);

  // ── Color mode observer ──
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setColorMode(el.classList.contains("light") ? "light" : "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // ── Hydrate document from store ──
  const hydrateDoc = useCallback(() => {
    const state = useFourCornersStore.getState();
    const vw = containerRef.current?.clientWidth;
    setDoc(storeToCanvasDocument(state, undefined, vw, { treeLayout: true }));
  }, []);

  // Initial hydration + store subscription for live updates during panel edits
  useEffect(() => {
    hydrateDoc();
  }, [hydrateDoc]);

  useEffect(() => {
    if (interaction.mode === "idle") return;
    const unsub = useFourCornersStore.subscribe(() => hydrateDoc());
    return unsub;
  }, [interaction.mode, hydrateDoc]);

  // ── Shape tap → route to appropriate interaction ──
  const handleShapeTap = useCallback((shape: ShapeJSON) => {
    if (isReadOnly) return;

    // Photo card tap → upload if no image
    if (shape.id === "photo-main" && !shape.data?.imageUrl) {
      fileInputRef.current?.click();
      return;
    }

    // Zone tap → open panel
    if (shape.type === "zone") {
      const corner = shape.metadata?.corner as NonNullable<CornerAffinity> | undefined;
      if (!corner) return;
      const useMobilePanel = (containerRef.current?.clientWidth ?? 640) < 480;
      if (useMobilePanel) {
        setInteraction({ mode: "full-panel", zone: corner });
      } else {
        setInteraction({
          mode: "mini-panel",
          state: { zone: corner, anchorPos: { x: 200, y: 200 } },
        });
      }
      return;
    }

    // Text block → open parent zone panel (inline edit needs 3D projection — future step)
    if (shape.type === "text-block") {
      const affinity = (shape.data?.cornerAffinity || shape.metadata?.cornerAffinity) as string | null;
      if (affinity) {
        setInteraction({ mode: "full-panel", zone: affinity as NonNullable<CornerAffinity> });
        return;
      }
    }

    // Context item, link, voice note → open parent zone panel
    const affinity = (shape.data?.cornerAffinity || shape.metadata?.cornerAffinity || shape.metadata?.parentCorner) as string | null;
    if (affinity) {
      setInteraction({ mode: "full-panel", zone: affinity as NonNullable<CornerAffinity> });
    }
  }, [isReadOnly]);

  const handleBackgroundTap = useCallback(() => {
    if (interaction.mode !== "idle") {
      handleInteractionClose();
    }
  }, [interaction.mode]);

  // ── Interaction close (with exit animation for panels) ──
  const handleInteractionClose = useCallback(() => {
    if (interaction.mode === "idle") {
      setInteraction({ mode: "idle" });
      hydrateDoc();
      return;
    }
    setPanelExiting(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      setPanelExiting(false);
      setInteraction({ mode: "idle" });
      hydrateDoc();
      exitTimerRef.current = null;
    }, 200);
  }, [interaction.mode, hydrateDoc]);

  // ── Photo upload ──
  const handleMainImageSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      useFourCornersStore.setState({ imageSrc: reader.result as string });
      hydrateDoc();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [hydrateDoc]);

  // ── Image drag-and-drop ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let dragCounter = 0;
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types.includes("Files")) setIsDraggingFile(true);
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; setIsDraggingFile(false); }
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDraggingFile(false);
      const isMedia = (f: File) =>
        f.type.startsWith("image/") ||
        f.type.startsWith("video/") ||
        /\.(heic|heif|mp4|webm|mov|m4v|avi|mkv|3gp|3g2|mpeg|mpg|ogv|wmv|flv|hevc|m2ts|ts)$/i.test(f.name);
      const file = Array.from(e.dataTransfer?.files || []).find(isMedia);
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        useFourCornersStore.setState({ imageSrc: reader.result as string });
        hydrateDoc();
      };
      reader.readAsDataURL(file);
    };
    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);
    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);
    };
  }, [hydrateDoc]);

  // ── Toolbar handlers ──
  const handleSwitchToForm = useCallback(() => {
    setLayoutMode("scroll");
    const url = new URL(window.location.href);
    url.searchParams.set("layout", "scroll");
    window.history.replaceState({}, "", url.toString());
  }, [setLayoutMode]);

  const handlePresetSwitch = useCallback((presetId: string) => {
    const state = useFourCornersStore.getState();
    const vw = containerRef.current?.clientWidth;
    setDoc(storeToCanvasDocument(state, getPreset(presetId), vw, { treeLayout: true }));
  }, []);

  const openInteraction = useCallback((state: InteractionState) => {
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    setPanelExiting(false);
    setInteraction(state);
  }, []);

  const handleInsertShape = useCallback((type: string) => {
    const zoneMap: Record<string, NonNullable<CornerAffinity>> = {
      "text-block": "backstory", "link-card": "links", "context-item": "context",
    };
    const zone = zoneMap[type];
    if (zone) openInteraction({ mode: "full-panel", zone });
  }, [openInteraction]);

  const handleVoiceRecord = useCallback(() => {
    openInteraction({ mode: "full-panel", zone: "backstory" });
  }, [openInteraction]);

  const handleImageUpload = useCallback(() => {
    openInteraction({ mode: "full-panel", zone: "context" });
  }, [openInteraction]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keyboard when user is typing in panel inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape" && interaction.mode !== "idle") {
        setInteraction({ mode: "idle" });
        hydrateDoc();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [interaction.mode, hydrateDoc]);

  // ── Render ──
  return (
    <div className="fc-sketchboard">
      <SketchboardToolbar
        autosaveStatus={autosaveStatus}
        lastAutosaveError={lastAutosaveError}
        onSwitchToForm={handleSwitchToForm}
        onExport={onExport}
        onPresetSwitch={handlePresetSwitch}
        onVoiceRecord={handleVoiceRecord}
        onImageUpload={handleImageUpload}
        onInsertShape={handleInsertShape}
      />

      <div
        className="fc-sketchboard__canvas"
        style={{ width: "100%", flex: 1, position: "relative", overflow: "hidden" }}
      >
        {/* 3D canvas — fills the container */}
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
          {doc && (
            <FlowCanvas3D
              document={doc}
              colorMode={colorMode}
              isMobile={(containerRef.current?.clientWidth ?? 640) < 640}
              onShapeTap={handleShapeTap}
              onBackgroundTap={handleBackgroundTap}
            />
          )}
        </div>

        {/* Drag-and-drop overlay */}
        {isDraggingFile && (
          <div className="fc-sketchboard__drop-overlay" style={{ position: "absolute", inset: 0, zIndex: 300 }}>
            <div className="fc-sketchboard__drop-label">Drop image here</div>
          </div>
        )}

        {/* Panels — float above 3D canvas */}
        {interaction.mode === "mini-panel" && (
          <div className={panelExiting ? "fc-panel-exit" : ""} style={{ position: "absolute", inset: 0, zIndex: 300, pointerEvents: "none" }}>
            <div style={{ pointerEvents: "auto" }}>
              <MiniPanel
                state={interaction.state}
                onClose={handleInteractionClose}
              />
            </div>
          </div>
        )}

        {interaction.mode === "full-panel" && (
          <div className={panelExiting ? "fc-panel-exit" : ""} style={{ position: "absolute", inset: 0, zIndex: 300, pointerEvents: "none" }}>
            <div style={{ pointerEvents: "auto", height: "100%" }}>
              <ZonePanel
                zone={interaction.zone}
                onClose={handleInteractionClose}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input for main photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.heic,.heif"
        onChange={handleMainImageSelected}
        style={{ display: "none" }}
      />
    </div>
  );
}
