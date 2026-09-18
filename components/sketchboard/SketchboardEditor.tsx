"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import Konva from "konva";
import { fourCornersTheme } from "@fourcorners/canvas/theme";
import { Canvas, ShapeRegistry } from "@fourcorners/canvas";

// Register custom shapes (side-effect import)
import "./shapes";

import { SketchboardToolbar } from "./SketchboardToolbar";
import { ZonePanel } from "./ZonePanel";
import { InlineEditOverlay } from "./InlineEditOverlay";
import type { InlineEditState } from "./InlineEditOverlay";
import { MiniPanel } from "./MiniPanel";
import type { MiniPanelState } from "./MiniPanel";
import { storeToCanvasDocument, getLayout, setStoreField, getNestedValue, getVisibleZones } from "@/hooks/use-canvas-bridge";
import { renderZoneOverlays } from "./zone-overlays";
import { renderConnectionLines, fadeInConnectionLines } from "./connection-lines";
import { hitTestZone, hitTestShape, screenToCanvas } from "./zone-hit-test";
import { getPreset } from "./presets";
import { useFourCornersStore } from "@/lib/store";
import type { CornerAffinity } from "./shapes/types";
import type { AutosaveStatus } from "@/hooks/useAutosave";
import { useCanvasHover } from "@/hooks/use-canvas-hover";
import { Minus, Plus } from "lucide-react";
import { zoomToPoint, zoomToCenter, ZOOM_STEP } from "@/lib/canvas-zoom";

/** Discriminated union for canvas interaction state */
type InteractionState =
  | { mode: "idle" }
  | { mode: "inline-edit"; state: InlineEditState }
  | { mode: "mini-panel"; state: MiniPanelState }
  | { mode: "full-panel"; zone: NonNullable<CornerAffinity> };

/**
 * Resolve CSS variable references in the theme to actual computed values.
 * Konva (canvas) can't read CSS vars — needs real hex/rgb strings.
 */
function resolveCanvasTheme(): typeof fourCornersTheme {
  const style = getComputedStyle(document.documentElement);
  const resolve = (token: string, fallback: string): string => {
    const match = token.match(/var\(([^,)]+)(?:,\s*([^)]+))?\)/);
    if (!match) return token;
    const val = style.getPropertyValue(match[1]).trim();
    return val || match[2]?.trim() || fallback;
  };

  return {
    ...fourCornersTheme,
    canvasBg: resolve(fourCornersTheme.canvasBg, "#1a1a1a"),
    canvasDot: resolve(fourCornersTheme.canvasDot, "#3a3a3a"),
    shapeBorder: resolve(fourCornersTheme.shapeBorder, "#2d2d2d"),
    shapeSelectedBorder: resolve(fourCornersTheme.shapeSelectedBorder, "#09fff0"),
    shapeHoverBorder: resolve(fourCornersTheme.shapeHoverBorder, "#93c5fd"),
    shapePlaceholder: resolve(fourCornersTheme.shapePlaceholder, "#2d2d2d"),
    shapeSurface: resolve(fourCornersTheme.shapeSurface, "#1a1a1a"),
    badgeText: resolve(fourCornersTheme.badgeText, "#ffffff"),
    videoBg: resolve(fourCornersTheme.videoBg, "#1a1a2e"),
    overlayBg: resolve(fourCornersTheme.overlayBg, "rgba(0,0,0,0.5)"),
    textColor: resolve(fourCornersTheme.textColor, "#f5f5f5"),
    textSecondary: resolve(fourCornersTheme.textSecondary, "#94a3b8"),
    accentPrimary: resolve(fourCornersTheme.accentPrimary, "#09fff0"),
    handleColor: resolve(fourCornersTheme.handleColor, "#09fff0"),
    toolbarBg: resolve(fourCornersTheme.toolbarBg, "#1a1a1a"),
    toolbarBorder: resolve(fourCornersTheme.toolbarBorder, "#2d2d2d"),
    toolbarIconColor: resolve(fourCornersTheme.toolbarIconColor, "#94a3b8"),
  };
}

interface SketchboardEditorProps {
  isReadOnly: boolean;
  autosaveStatus: AutosaveStatus;
  lastAutosaveError: string | null;
  isPublished: boolean;
  inGallery: boolean;
  onExport: () => void;
  onImport: () => void;
}

export default function SketchboardEditor({
  isReadOnly,
  autosaveStatus,
  lastAutosaveError,
  onExport,
}: SketchboardEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [interaction, setInteraction] = useState<InteractionState>({ mode: "idle" });
  const [zoomLevel, setZoomLevel] = useState(1);
  /** When true, shapes are arranged via d3.tree() instead of the 2x2 quadrant grid. */
  const [treeLayout, setTreeLayout] = useState(false);
  const [panelExiting, setPanelExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  /** Last hydrated shapes for hit testing */
  const lastShapesRef = useRef<import("@fourcorners/canvas").ShapeJSON[]>([]);
  /** Intro animation runs once per mount */
  const hasAnimatedRef = useRef(false);

  const stageRef = useRef<{ x: () => number; y: () => number; scaleX: () => number; scaleY: () => number } | null>(null);

  const hydrateToCanvasRef = useRef<(() => void) | null>(null);
  const cameraAnimRef = useRef<number | null>(null);
  const setLayoutMode = useFourCornersStore((s) => s.setLayoutMode);
  // Hover cursor changes for editable shapes + zone hover detection
  const hoveredZone = useCanvasHover(containerRef, stageRef, lastShapesRef, canvasReady && interaction.mode === "idle");

  // ── Canvas initialization ──

  useEffect(() => {
    const el = containerRef.current;
    if (!el || canvasRef.current) return;

    const resolvedTheme = resolveCanvasTheme();
    const instance = new Canvas({
      container: el,
      width: el.clientWidth || 800,
      height: el.clientHeight || 600,
      theme: resolvedTheme,
    });
    instance.setMode(isReadOnly ? "view" : "edit");

    // Enable stage dragging for pan navigation (touch + mouse)
    // Only drag when touching empty canvas, not shapes
    instance.stage.draggable(true);
    instance.stage.on("dragstart", (e: Konva.KonvaEventObject<DragEvent>) => {
      if (e.target !== instance.stage) {
        instance.stage.stopDrag();
      }
    });
    // Sync camera + redraw grid after pan drag
    instance.stage.on("dragend", () => {
      const pos = instance.stage.position();
      const sc = instance.stage.scaleX();
      instance.setCamera({ x: pos.x, y: pos.y, zoom: sc });
    });

    // Pinch-to-zoom for mobile
    let lastDist = 0;
    instance.stage.on("touchmove", (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (!touches || touches.length < 2) return;
      e.evt.preventDefault();
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastDist > 0) {
        const scaleBy = dist / lastDist;
        const midX = (touches[0].clientX + touches[1].clientX) / 2;
        const midY = (touches[0].clientY + touches[1].clientY) / 2;
        const rect = el.getBoundingClientRect();
        const cam = zoomToPoint(
          instance.camera,
          midX - rect.left,
          midY - rect.top,
          instance.camera.zoom * scaleBy,
        );
        instance.setCamera(cam);
        setZoomLevel(cam.zoom);
      }
      lastDist = dist;
    });
    instance.stage.on("touchend", () => { lastDist = 0; });

    // Scroll wheel zoom (parity with FlowCanvas)
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      const rect = el.getBoundingClientRect();
      const cam = zoomToPoint(
        instance.camera,
        e.clientX - rect.left,
        e.clientY - rect.top,
        instance.camera.zoom * (1 + dir * ZOOM_STEP),
      );
      instance.setCamera(cam);
      setZoomLevel(cam.zoom);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });

    canvasRef.current = instance;
    stageRef.current = instance.stage;
    setCanvasReady(true);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastBreakpoint = el.clientWidth < 640 ? "mobile" : "desktop";
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          instance.stage.width(width);
          instance.stage.height(height);

          const bp = width < 640 ? "mobile" : "desktop";
          if (bp !== lastBreakpoint) {
            lastBreakpoint = bp;
            // Debounce: re-hydrate with new layout after resize settles
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => hydrateToCanvasRef.current?.(), 150);
          }
        }
      }
    });
    observer.observe(el);

    // Re-theme canvas when light/dark mode toggles — debounced to ignore
    // unrelated class mutations (analytics, A/B tools, etc.)
    let lastDarkMode = document.documentElement.classList.contains("dark");
    const themeObserver = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      if (isDark === lastDarkMode) return; // no actual theme change
      lastDarkMode = isDark;
      const newTheme = resolveCanvasTheme();
      instance.setTheme(newTheme);
      hydrateToCanvasRef.current?.();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      el.removeEventListener("wheel", handleWheel);
      observer.disconnect();
      themeObserver.disconnect();
      instance.destroy();
      canvasRef.current = null;
    };
  }, [isReadOnly]);

  // ── Canvas hydration ──

  const hydrateToCanvas = useCallback((preset?: Parameters<typeof storeToCanvasDocument>[1]) => {
    const canvas = canvasRef.current;
    const el = containerRef.current;
    if (!canvas) return;

    const vw = el?.clientWidth;
    const state = useFourCornersStore.getState();
    const doc = storeToCanvasDocument(state, preset, vw, { treeLayout });
    lastShapesRef.current = doc.shapes;

    // Clear ALL content layer children (shapes + overlays + stale nodes)
    canvas.contentLayer.destroyChildren();
    // Also clear the shape instance map
    for (const s of canvas.getShapes()) {
      canvas.removeShape(s.id);
    }

    // Render shapes
    const renderCtx = {
      theme: canvas.theme,
      mode: (isReadOnly ? "view" : "edit") as "view" | "edit",
      camera: { x: 0, y: 0, zoom: 1 },
      selected: false,
    };

    for (const shapeJson of doc.shapes) {
      const ShapeClass = ShapeRegistry.get(shapeJson.type);
      if (!ShapeClass) continue;
      const instance = new ShapeClass();
      instance.deserialize(shapeJson);
      canvas.addShape(instance);

      const konvaNode = instance.render(renderCtx);
      if (konvaNode) {
        if (Array.isArray(konvaNode)) {
          konvaNode.forEach((n: Konva.Group | Konva.Shape) => canvas.contentLayer.add(n));
        } else {
          canvas.contentLayer.add(konvaNode);
        }
      }
    }

    // Overlays for empty zones (skip hidden zones)
    renderZoneOverlays(canvas, state, vw, getVisibleZones(state));

    // Connection lines between shapes
    if (doc.connections.length > 0) {
      renderConnectionLines(canvas, doc.connections, doc.shapes);
    }

    const layout = getLayout(vw);

    // First load: zoom to center photo, then animate outward
    if (!hasAnimatedRef.current && state.imageSrc) {
      hasAnimatedRef.current = true;

      // Start zoomed on center photo
      const photoW = Math.min(400, layout.zw * 0.8);
      const photoH = photoW * 0.75;
      canvas.fitBounds(
        { x: layout.photoX, y: layout.photoY, width: photoW, height: photoH },
        60,
      );
      setZoomLevel(canvas.camera.zoom);

      // Fade in connection lines during the reveal
      fadeInConnectionLines(canvas, 0.8);

      // Compute the full-view target camera
      const from = { ...canvas.camera };
      canvas.fitBounds({ x: 0, y: 0, width: layout.totalW, height: layout.totalH }, 40);
      const to = { ...canvas.camera };
      canvas.setCamera(from); // reset to zoomed-in

      // Animate outward after a pause
      const introTimer = setTimeout(() => {
        if (cameraAnimRef.current) cancelAnimationFrame(cameraAnimRef.current);
        const duration = 800;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
          canvas.setCamera({
            x: from.x + (to.x - from.x) * e,
            y: from.y + (to.y - from.y) * e,
            zoom: from.zoom + (to.zoom - from.zoom) * e,
          });
          setZoomLevel(from.zoom + (to.zoom - from.zoom) * e);
          if (t < 1) {
            cameraAnimRef.current = requestAnimationFrame(tick);
          } else {
            cameraAnimRef.current = null;
          }
        };
        cameraAnimRef.current = requestAnimationFrame(tick);
      }, 600);

      // Cleanup if component unmounts during intro
      return () => clearTimeout(introTimer);
    }

    // Normal re-hydration: immediate fitBounds.
    // Tree layout recomputes doc.canvas.{width,height} to fit the tree,
    // so prefer those when treeLayout is on.
    hasAnimatedRef.current = true;
    const fitW = treeLayout ? doc.canvas.width : layout.totalW;
    const fitH = treeLayout ? doc.canvas.height : layout.totalH;
    canvas.fitBounds({ x: 0, y: 0, width: fitW, height: fitH }, 40);
    setZoomLevel(canvas.camera.zoom);
  }, [isReadOnly, treeLayout]);

  // Keep ref in sync for ResizeObserver callback
  hydrateToCanvasRef.current = hydrateToCanvas;

  // Initial hydration
  useEffect(() => {
    if (canvasReady) hydrateToCanvas();
  }, [canvasReady, hydrateToCanvas]);

  // ── Click detection: shape-first, then zone fallback ──

  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas || !canvasReady) return;

    const stage = canvas.stage;
    let downX = 0, downY = 0;
    const DRAG_THRESHOLD = 8;

    const handleDown = (e: MouseEvent | TouchEvent) => {
      const pt = "touches" in e ? e.touches[0] : e;
      downX = pt.clientX;
      downY = pt.clientY;
    };

    const handleUp = (e: MouseEvent | TouchEvent) => {
      const pt = "changedTouches" in e ? e.changedTouches[0] : e;
      const dx = pt.clientX - downX;
      const dy = pt.clientY - downY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) return; // was a drag

      // Ignore clicks inside panels or overlays (panels are in the outer wrapper, not the Konva container)
      const wrapper = el.parentElement;
      const panel = wrapper?.querySelector(".fc-zone-panel, .fc-mini-panel, .fc-inline-overlay");
      if (panel && panel.contains(e.target as Node)) return;

      const rect = el.getBoundingClientRect();
      const stageX = pt.clientX - rect.left;
      const stageY = pt.clientY - rect.top;

      const canvasPos = screenToCanvas(stageX, stageY, stage);

      // 1. Shape hit test first (for inline editing)
      const shapeHit = hitTestShape(canvasPos.x, canvasPos.y, lastShapesRef.current);
      if (shapeHit && shapeHit.fieldMapping) {
        // Editable text shape → inline edit
        const [section, field] = shapeHit.fieldMapping.split(".");
        const store = useFourCornersStore.getState();
        const value = getNestedValue(store as unknown as Record<string, unknown>, section, field);

        setInteraction({
          mode: "inline-edit",
          state: {
            shapeId: shapeHit.shape.id,
            fieldMapping: shapeHit.fieldMapping,
            canvasRect: {
              x: shapeHit.shape.x,
              y: shapeHit.shape.y,
              w: shapeHit.shape.width,
              h: shapeHit.shape.height,
            },
            value,
            inputType: shapeHit.inputType,
            cornerAffinity: (shapeHit.shape.data?.cornerAffinity || shapeHit.shape.metadata?.cornerAffinity) as string | null,
          },
        });
        return;
      }

      // 2. Zone hit test (for mini-panel or center photo upload)
      const visible = getVisibleZones(useFourCornersStore.getState());
      const zone = hitTestZone(canvasPos.x, canvasPos.y, el.clientWidth, visible);

      if (zone === "center") {
        if (!useFourCornersStore.getState().imageSrc) {
          fileInputRef.current?.click();
        }
      } else if (zone) {
        // Use mini-panel for complex controls (on desktop), full panel on narrow screens
        const useMobilePanel = el.clientWidth < 480;
        if (useMobilePanel) {
          setInteraction({ mode: "full-panel", zone });
        } else {
          setInteraction({
            mode: "mini-panel",
            state: {
              zone,
              anchorPos: { x: pt.clientX - rect.left, y: pt.clientY - rect.top },
            },
          });
        }
      }
    };

    // Double-click to zoom in/out
    const handleDblClick = (e: MouseEvent) => {
      // Ignore if inside panels (panels are in the outer wrapper)
      const dblWrapper = el.parentElement;
      const panel = dblWrapper?.querySelector(".fc-zone-panel, .fc-mini-panel, .fc-inline-overlay");
      if (panel && panel.contains(e.target as Node)) return;

      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const canvasPos = screenToCanvas(sx, sy, stage);

      // Don't zoom if double-clicking an editable shape (inline-edit handles it)
      const shapeHit = hitTestShape(canvasPos.x, canvasPos.y, lastShapesRef.current);
      if (shapeHit?.fieldMapping) return;

      const oldZoom = canvas.camera.zoom;
      if (oldZoom < 2) {
        // Zoom in centered on click
        const cam = zoomToPoint(canvas.camera, sx, sy, Math.min(oldZoom * 1.5, 3));
        canvas.setCamera(cam);
        setZoomLevel(cam.zoom);
      } else {
        // Reset to fit
        const layout = getLayout(el.clientWidth);
        canvas.fitBounds({ x: 0, y: 0, width: layout.totalW, height: layout.totalH }, 40);
        setZoomLevel(canvas.camera.zoom);
      }
    };

    el.addEventListener("mousedown", handleDown);
    el.addEventListener("mouseup", handleUp);
    el.addEventListener("touchstart", handleDown, { passive: true });
    el.addEventListener("touchend", handleUp);
    el.addEventListener("dblclick", handleDblClick);
    return () => {
      el.removeEventListener("mousedown", handleDown);
      el.removeEventListener("mouseup", handleUp);
      el.removeEventListener("touchstart", handleDown);
      el.removeEventListener("touchend", handleUp);
      el.removeEventListener("dblclick", handleDblClick);
    };
  }, [canvasReady]);

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
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsDraggingFile(false);
      }
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
        hydrateToCanvas();
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
  }, [hydrateToCanvas]);

  // ── Zoom controls ──

  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    const el = containerRef.current;
    if (!canvas || !el) return;
    const cam = zoomToCenter(canvas.camera, el.clientWidth, el.clientHeight, canvas.camera.zoom * 1.2);
    canvas.setCamera(cam);
    setZoomLevel(cam.zoom);
  }, []);

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    const el = containerRef.current;
    if (!canvas || !el) return;
    const cam = zoomToCenter(canvas.camera, el.clientWidth, el.clientHeight, canvas.camera.zoom / 1.2);
    canvas.setCamera(cam);
    setZoomLevel(cam.zoom);
  }, []);

  const handleFitView = useCallback(() => {
    const canvas = canvasRef.current;
    const el = containerRef.current;
    if (!canvas || !el) return;
    const layout = getLayout(el.clientWidth);
    canvas.fitBounds({ x: 0, y: 0, width: layout.totalW, height: layout.totalH }, 40);
    setZoomLevel(canvas.camera.zoom);
  }, []);

  // ── Keyboard shortcuts ──

  useEffect(() => {
    if (!canvasReady) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when inline editing text
      if (interaction.mode === "inline-edit") return;
      // Don't intercept when focus is in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "+":
        case "=":
          e.preventDefault();
          handleZoomIn();
          break;
        case "-":
          e.preventDefault();
          handleZoomOut();
          break;
        case "0":
          e.preventDefault();
          handleFitView();
          break;
        case "Escape":
          if (interaction.mode !== "idle") {
            setInteraction({ mode: "idle" });
            hydrateToCanvas();
          }
          break;
        case "z":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault(); // prevent browser undo
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canvasReady, interaction.mode, handleZoomIn, handleZoomOut, handleFitView, hydrateToCanvas]);

  // ── Live canvas refresh while a panel is open ──

  useEffect(() => {
    if (interaction.mode === "idle" || interaction.mode === "inline-edit") return;

    const unsub = useFourCornersStore.subscribe(() => {
      hydrateToCanvas();
    });

    return unsub;
  }, [interaction.mode, hydrateToCanvas]);

  // Close any interaction with exit animation, then refresh canvas
  const handleInteractionClose = useCallback(() => {
    // Inline edits don't need exit animation
    if (interaction.mode === "inline-edit" || interaction.mode === "idle") {
      setInteraction({ mode: "idle" });
      hydrateToCanvas();
      return;
    }
    // Start exit animation
    setPanelExiting(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      setPanelExiting(false);
      setInteraction({ mode: "idle" });
      hydrateToCanvas();
      exitTimerRef.current = null;
    }, 200); // matches CSS animation duration
  }, [interaction.mode, hydrateToCanvas]);

  // Inline edit commit: write to store, refresh canvas, close overlay
  const handleInlineCommit = useCallback(
    (value: string) => {
      if (interaction.mode !== "inline-edit") return;
      const fm = interaction.state.fieldMapping;
      const [section, field] = fm.split(".");
      setStoreField(section, field, value);
      useFourCornersStore.getState().markUnsaved();
      setInteraction({ mode: "idle" });
      hydrateToCanvas();
    },
    [interaction, hydrateToCanvas],
  );

  // Inline edit cancel: just close without saving
  const handleInlineCancel = useCallback(() => {
    setInteraction({ mode: "idle" });
  }, []);

  // ── Toolbar handlers ──

  const handleSwitchToForm = useCallback(() => {
    setLayoutMode("scroll");
    const url = new URL(window.location.href);
    url.searchParams.set("layout", "scroll");
    window.history.replaceState({}, "", url.toString());
  }, [setLayoutMode]);

  const handlePresetSwitch = useCallback(
    (presetId: string) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        hydrateToCanvas(getPreset(presetId));
        return;
      }
      const from = { ...canvas.camera };
      hydrateToCanvas(getPreset(presetId));
      const to = { ...canvas.camera };

      // Cancel any running camera animation
      if (cameraAnimRef.current) cancelAnimationFrame(cameraAnimRef.current);

      // Animate camera from old position to new
      const duration = 300;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        // Ease-out cubic
        const e = 1 - Math.pow(1 - t, 3);
        canvas.setCamera({
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          zoom: from.zoom + (to.zoom - from.zoom) * e,
        });
        setZoomLevel(from.zoom + (to.zoom - from.zoom) * e);
        if (t < 1) {
          cameraAnimRef.current = requestAnimationFrame(tick);
        } else {
          cameraAnimRef.current = null;
        }
      };
      cameraAnimRef.current = requestAnimationFrame(tick);
    },
    [hydrateToCanvas],
  );

  // Cancel any running exit animation before opening a new panel
  const openInteraction = useCallback((state: InteractionState) => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setPanelExiting(false);
    setInteraction(state);
  }, []);

  const handleInsertShape = useCallback((type: string) => {
    // Map toolbar shape types to zone panels — open full panel for toolbar actions
    const zoneMap: Record<string, NonNullable<CornerAffinity>> = {
      "text-block": "backstory",
      "link-card": "links",
      "context-item": "context",
    };
    const zone = zoneMap[type];
    if (zone) {
      openInteraction({ mode: "full-panel", zone });
    }
  }, [openInteraction]);

  const handleVoiceRecord = useCallback(() => {
    openInteraction({ mode: "full-panel", zone: "backstory" });
  }, [openInteraction]);

  const handleImageUpload = useCallback(() => {
    openInteraction({ mode: "full-panel", zone: "context" });
  }, [openInteraction]);

  const handleMainImageSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        useFourCornersStore.setState({ imageSrc: dataUrl });
        hydrateToCanvas();
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [hydrateToCanvas],
  );

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
        treeLayout={treeLayout}
        onToggleTreeLayout={() => setTreeLayout((v) => !v)}
      />

      <div
        className="fc-sketchboard__canvas"
        style={{ width: "100%", flex: 1, position: "relative", overflow: "hidden" }}
      >
        {/* Konva canvas — isolated div so React never touches its children */}
        <div
          ref={containerRef}
          style={{ position: "absolute", inset: 0 }}
        />

        {/* React-managed overlays — sibling layer above the Konva canvas */}

        {/* Drag-and-drop overlay */}
        {isDraggingFile && (
          <div className="fc-sketchboard__drop-overlay">
            <div className="fc-sketchboard__drop-label">Drop image here</div>
          </div>
        )}

        {/* Zone hover overlay */}
        {hoveredZone && hoveredZone !== "center" && canvasRef.current && (() => {
          const layout = getLayout(containerRef.current?.clientWidth);
          const pos = layout.positions[hoveredZone];
          if (!pos) return null;
          const cam = canvasRef.current!.camera;
          const accent = (() => {
            const colors: Record<string, string> = {
              backstory: "var(--fc-corner-backstory)",
              context: "var(--fc-corner-context)",
              links: "var(--fc-corner-links)",
              cc: "var(--fc-corner-cc)",
            };
            return colors[hoveredZone] || "var(--fc-accent)";
          })();
          return (
            <div
              className="fc-zone-hover-overlay"
              style={{
                left: pos.x * cam.zoom + cam.x,
                top: pos.y * cam.zoom + cam.y,
                width: layout.zw * cam.zoom,
                height: layout.zh * cam.zoom,
                "--zone-hover-accent": accent,
              } as React.CSSProperties}
            />
          );
        })()}

        {/* Inline edit overlay — HTML input positioned over canvas shape */}
        {interaction.mode === "inline-edit" && canvasRef.current && (
          <InlineEditOverlay
            state={interaction.state}
            stage={canvasRef.current.stage}
            onCommit={handleInlineCommit}
            onCancel={handleInlineCancel}
          />
        )}

        {/* Mini-panel — compact floating panel for complex controls */}
        {interaction.mode === "mini-panel" && (
          <div className={panelExiting ? "fc-panel-exit" : ""}>
            <MiniPanel
              state={interaction.state}
              onClose={handleInteractionClose}
            />
          </div>
        )}

        {/* Full zone panel — fallback for toolbar actions + mobile */}
        {interaction.mode === "full-panel" && (
          <div className={panelExiting ? "fc-panel-exit" : ""}>
            <ZonePanel
              zone={interaction.zone}
              onClose={handleInteractionClose}
            />
          </div>
        )}
        {/* Zoom controls */}
        <div className="fc-zoom-controls">
          <button onClick={handleZoomOut} className="fc-zoom-controls__btn" title="Zoom out" aria-label="Zoom out">
            <Minus size={14} />
          </button>
          <button onClick={handleFitView} className="fc-zoom-controls__label" title="Fit to content" aria-label="Reset zoom">
            {Math.round(zoomLevel * 100)}%
          </button>
          <button onClick={handleZoomIn} className="fc-zoom-controls__btn" title="Zoom in" aria-label="Zoom in">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Hidden file input for main photo upload (center click) */}
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
