"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { TOUCH } from "three";
import type { CanvasDocument, ShapeJSON } from "@fourcorners/canvas";
import { ExploreCard } from "./ExploreCard";
import { ConnectionLines } from "./ConnectionLines";
import { computeLayout, type LayoutOptions } from "./explore-layout";
import { useExploreHierarchy, buildExploreHierarchy as buildExploreHierarchyPure } from "./use-explore-hierarchy";

// ── theme backgrounds ──

const BG = { dark: "#1a1a1a", light: "#f8f7f5" } as const;
const ACCENT = { dark: "#09fff0", light: "#c026d3" } as const;

// ── types ──

interface FlowCanvas3DProps {
  document: CanvasDocument;
  colorMode: "dark" | "light";
  isMobile?: boolean;
  /** Editor callback — tap on a shape (zone, text, photo, etc.) */
  onShapeTap?: (shape: ShapeJSON) => void;
  /** Editor callback — tap on empty canvas background */
  onBackgroundTap?: () => void;
}

// ── shared tool button style ──

const TOOL_BTN: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid var(--fc-border)",
  background: "var(--fc-surface)",
  color: "var(--fc-text)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  opacity: 0.85,
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
};

// ── dot grid background plane ──

function DotGrid({ colorMode, isMobile }: { colorMode: "dark" | "light"; isMobile: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Desktop: line grid in light primary color. Mobile: subtle dot grid.
  const gridColor = colorMode === "dark" ? "#09fff0" : "#0d9488";
  const gridOpacity = isMobile ? 0.06 : 0.08;

  const uniforms = useMemo(() => ({
    uBg: { value: new THREE.Color(BG[colorMode]) },
    uLine: { value: new THREE.Color(gridColor) },
    uSpacing: { value: 1.0 },
    uLineWidth: { value: 0.012 },
    uOpacity: { value: gridOpacity },
    uDotMode: { value: isMobile ? 1.0 : 0.0 },
  }), []);

  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uBg.value.set(BG[colorMode]);
    materialRef.current.uniforms.uLine.value.set(colorMode === "dark" ? "#09fff0" : "#0d9488");
    materialRef.current.uniforms.uOpacity.value = isMobile ? 0.06 : 0.08;
    materialRef.current.uniforms.uDotMode.value = isMobile ? 1.0 : 0.0;
  }, [colorMode, isMobile]);

  return (
    <mesh ref={meshRef} position={[0, 0, -1]} renderOrder={-1}>
      <planeGeometry args={[200, 200]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vWorldPos;
          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uBg;
          uniform vec3 uLine;
          uniform float uSpacing;
          uniform float uLineWidth;
          uniform float uOpacity;
          uniform float uDotMode;
          varying vec2 vWorldPos;
          void main() {
            // Distance to nearest grid line on each axis
            float dx = abs(mod(vWorldPos.x + 0.5 * uSpacing, uSpacing) - 0.5 * uSpacing);
            float dy = abs(mod(vWorldPos.y + 0.5 * uSpacing, uSpacing) - 0.5 * uSpacing);
            float nearest = min(dx, dy);
            float grid = 1.0 - smoothstep(0.0, uLineWidth, nearest);

            // Dot mode for mobile: dots at intersections
            vec2 snap = round(vWorldPos / uSpacing) * uSpacing;
            float d = length(vWorldPos - snap);
            float dot = 1.0 - smoothstep(0.03, 0.05, d);

            float pattern = mix(grid, dot, uDotMode);
            gl_FragColor = vec4(mix(uBg, uLine, pattern * uOpacity), 1.0);
          }
        `}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── reactive scene background ──

function SceneBackground({ color }: { color: string }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color(color);
  }, [scene, color]);
  return null;
}

// ── smooth camera animation (target + zoom) ──

const LERP_SPEED = 4;
const ZOOM_IN_LEVEL = 80;   // ortho zoom when focused on a node
const ZOOM_OUT_LEVEL = 50;  // ortho zoom for tree overview

function CameraAnimator({
  target,
  zoom,
  controlsRef,
}: {
  target: THREE.Vector3 | null;
  zoom: "in" | "out" | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const goalRef = useRef<THREE.Vector3 | null>(null);
  const zoomGoalRef = useRef<number | null>(null);

  useEffect(() => {
    goalRef.current = target;
  }, [target]);

  useEffect(() => {
    if (zoom === "in") zoomGoalRef.current = ZOOM_IN_LEVEL;
    else if (zoom === "out") zoomGoalRef.current = ZOOM_OUT_LEVEL;
    else zoomGoalRef.current = null;
  }, [zoom]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const alpha = 1 - Math.exp(-LERP_SPEED * delta);
    let dirty = false;

    // Animate target (pan)
    const goal = goalRef.current;
    if (goal) {
      const t = controls.target;
      if (t.distanceTo(goal) < 0.01) {
        t.copy(goal);
        goalRef.current = null;
      } else {
        t.lerp(goal, alpha);
      }
      dirty = true;
    }

    // Animate ortho zoom level
    const zGoal = zoomGoalRef.current;
    if (zGoal !== null) {
      const cam = controls.object as THREE.OrthographicCamera;
      const diff = Math.abs(cam.zoom - zGoal);
      if (diff < 0.5) {
        cam.zoom = zGoal;
        zoomGoalRef.current = null;
      } else {
        cam.zoom += (zGoal - cam.zoom) * alpha;
      }
      cam.updateProjectionMatrix();
      dirty = true;
    }

    if (dirty) controls.update();
  });

  return null;
}

// ── inner scene (rendered inside Canvas) ──

function Scene({
  doc,
  colorMode,
  isMobile,
  onControlsReady,
  onShapeTap,
  onBackgroundTap,
  navigateToRef,
}: {
  doc: CanvasDocument;
  colorMode: "dark" | "light";
  isMobile: boolean;
  onControlsReady?: (controls: OrbitControlsImpl) => void;
  onShapeTap?: (shape: ShapeJSON) => void;
  onBackgroundTap?: () => void;
  navigateToRef?: React.MutableRefObject<((id: string) => void) | null>;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [dragOverrides, setDragOverrides] = useState<Map<string, [number, number, number]>>(new Map());
  const [cameraTarget, setCameraTarget] = useState<THREE.Vector3 | null>(null);
  const [zoomState, setZoomState] = useState<"in" | "out" | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // d3-hierarchy: single source of truth for parent/child relationships,
  // zone colors, corner color inheritance, and depth information
  const hierarchy = useExploreHierarchy(doc.shapes, doc.connections);

  // Spatial 3D layout — positions computed from 4C structure, not 2D pixel coords
  // On desktop/landscape, stretch horizontally to fill wide viewports
  const layoutOpts: LayoutOptions = useMemo(
    () => ({ landscape: !isMobile, hierarchy }),
    [isMobile, hierarchy],
  );
  const basePositions = useMemo(
    () => computeLayout(doc.shapes, doc.connections, layoutOpts),
    [doc.shapes, doc.connections, layoutOpts],
  );

  // Merge drag overrides
  const positions = useMemo(() => {
    if (dragOverrides.size === 0) return basePositions;
    const merged = new Map(basePositions);
    for (const [id, pos] of dragOverrides) {
      merged.set(id, pos);
    }
    return merged;
  }, [basePositions, dragOverrides]);

  // Compute vertical extent of tree for mobile camera positioning
  const treeBounds = useMemo(() => {
    let minY = Infinity, maxY = -Infinity;
    for (const [, pos] of positions) {
      if (pos[1] < minY) minY = pos[1];
      if (pos[1] > maxY) maxY = pos[1];
    }
    if (!isFinite(minY)) return { centerY: 0, extent: 10 };
    return { centerY: (minY + maxY) / 2, extent: maxY - minY };
  }, [positions]);

  // Expose navigateTo for outer component's up/down nav buttons
  const navigateTo = useCallback((id: string) => {
    setFocusedId(id);
    const pos = positions.get(id);
    if (pos) {
      setCameraTarget(new THREE.Vector3(pos[0], pos[1], 0));
      if (!isMobile) setZoomState("in");
    }
  }, [positions, isMobile]);

  useEffect(() => {
    if (navigateToRef) navigateToRef.current = navigateTo;
  }, [navigateToRef, navigateTo]);

  // Derived maps from hierarchy (single tree walk, no redundant computation)
  const shapeColors = hierarchy?.shapeColors ?? new Map<string, string>();
  const zoneIds = hierarchy?.zoneIds ?? new Set<string>();
  const cornerColorOf = hierarchy?.cornerColorOf ?? new Map<string, string>();
  const depthOf = hierarchy?.depthOf ?? new Map<string, number>();

  // Drag handlers
  const handleDragStart = useCallback(() => {
    if (controlsRef.current) controlsRef.current.enabled = false;
  }, []);

  const handleDrag = useCallback((id: string, pos: [number, number, number]) => {
    setDragOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, pos);
      return next;
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (controlsRef.current) controlsRef.current.enabled = true;
  }, []);

  const handleFocus = useCallback((id: string) => {
    // In editor mode, route taps to the editor callback
    if (onShapeTap) {
      const shape = doc.shapes.find((s) => s.id === id);
      if (shape) {
        onShapeTap(shape);
        return;
      }
    }
    // Toggle: click to pan to node, click again to pan back
    if (focusedId === id) {
      setFocusedId(null);
      setCameraTarget(new THREE.Vector3(0, isMobile ? treeBounds.centerY : 0, 0));
      if (!isMobile) setZoomState("out");
    } else {
      setFocusedId(id);
      const pos = positions.get(id);
      if (pos) {
        setCameraTarget(new THREE.Vector3(pos[0], pos[1], 0));
        if (!isMobile) setZoomState("in");
      }
    }
  }, [onShapeTap, doc.shapes, positions, focusedId, isMobile]);

  return (
    <>
      <SceneBackground color={BG[colorMode]} />
      <DotGrid colorMode={colorMode} isMobile={isMobile} />
      <ambientLight intensity={0.9} />
      <pointLight position={[0, 5, 10]} intensity={0.4} />

      <OrbitControls
        ref={(controls) => {
          (controlsRef as React.MutableRefObject<OrbitControlsImpl | null>).current = controls;
          if (controls) {
            controls.target.set(0, isMobile ? treeBounds.centerY : 0, 0);
            onControlsReady?.(controls);
          }
        }}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={Math.PI * 0.5}
        minPolarAngle={Math.PI * 0.5}
        enablePan
        enableRotate={false}
        enableZoom
        zoomSpeed={0.8}
        minZoom={15}
        maxZoom={120}
        screenSpacePanning
        touches={{ ONE: TOUCH.DOLLY_PAN, TWO: TOUCH.DOLLY_PAN }}
      />

      <CameraAnimator target={cameraTarget} zoom={zoomState} controlsRef={controlsRef} />

      <ConnectionLines
        root={hierarchy?.root ?? null}
        positions={positions}
        shapeColors={shapeColors}
        zoneIds={zoneIds}
        defaultColor={ACCENT[colorMode]}
        collapsedZones={undefined}
      />

      {doc.shapes.map((shape: ShapeJSON) => {
        const pos = positions.get(shape.id);
        if (!pos) return null;
        const isZone = shape.type === "zone";
        return (
          <ExploreCard
            key={shape.id}
            shape={shape}
            position={pos}
            colorMode={colorMode}
            isMobile={isMobile}
            cornerColor={cornerColorOf.get(shape.id)}
            depth={depthOf.get(shape.id) ?? 0}
            focused={focusedId === shape.id}
            dimmed={!!focusedId && focusedId !== shape.id}
            childCount={isZone ? (hierarchy?.childrenOf.get(shape.id)?.length ?? 0) : 0}
            onFocus={handleFocus}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
          />
        );
      })}
    </>
  );
}

// ── main component ──

function FlowCanvas3DInner({ document: doc, colorMode, isMobile = false, onShapeTap, onBackgroundTap }: FlowCanvas3DProps) {
  const bg = BG[colorMode];
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Build node order in DOM-land for mobile nav
  const outerHierarchy = useMemo(
    () => buildExploreHierarchyPure(doc.shapes, doc.connections),
    [doc.shapes, doc.connections],
  );

  const nodeOrder = useMemo(() => {
    if (!outerHierarchy) return [] as string[];
    const order: string[] = [];
    outerHierarchy.root.eachBefore((node: any) => {
      if (node.data.id !== "__root__") order.push(node.data.id);
    });
    return order;
  }, [outerHierarchy]);

  const [navIndex, setNavIndex] = useState(0);

  // navigateToRef: Scene sets this so outer component can drive camera
  const navigateToRef = useRef<((id: string) => void) | null>(null);

  const navPrev = useCallback(() => {
    setNavIndex((i) => {
      const next = Math.max(0, i - 1);
      const id = nodeOrder[next];
      if (id) navigateToRef.current?.(id);
      return next;
    });
  }, [nodeOrder]);

  const navNext = useCallback(() => {
    setNavIndex((i) => {
      const next = Math.min(nodeOrder.length - 1, i + 1);
      const id = nodeOrder[next];
      if (id) navigateToRef.current?.(id);
      return next;
    });
  }, [nodeOrder]);

  // Keyboard navigation: arrow keys hop between nodes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        navNext();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        navPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navNext, navPrev]);

  const [toolsOpen, setToolsOpen] = useState(false);

  const handleReset = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
    setNavIndex(0);
  }, []);

  const handleZoomIn = useCallback(() => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object as THREE.OrthographicCamera;
    cam.zoom = Math.min(cam.zoom * 1.25, controlsRef.current.maxZoom);
    cam.updateProjectionMatrix();
    controlsRef.current.update();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object as THREE.OrthographicCamera;
    cam.zoom = Math.max(cam.zoom * 0.8, controlsRef.current.minZoom);
    cam.updateProjectionMatrix();
    controlsRef.current.update();
  }, []);

  const atStart = navIndex <= 0;
  const atEnd = navIndex >= nodeOrder.length - 1;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", touchAction: "none" }}>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 20], zoom: 50 }}
        style={{ background: bg, touchAction: "none" }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <Scene
          doc={doc}
          colorMode={colorMode}
          isMobile={isMobile}
          onControlsReady={(c) => { controlsRef.current = c; }}
          onShapeTap={onShapeTap}
          onBackgroundTap={onBackgroundTap}
          navigateToRef={navigateToRef}
        />
      </Canvas>

      {/* Expandable canvas tools */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          zIndex: 20,
        }}
      >
        {/* Toggle button */}
        <button
          onClick={() => setToolsOpen((o) => !o)}
          title={toolsOpen ? "Close tools" : "Canvas tools"}
          aria-label={toolsOpen ? "Close tools" : "Canvas tools"}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid var(--fc-border)",
            background: "var(--fc-surface)",
            color: "var(--fc-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            opacity: 0.85,
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            transition: "opacity 0.15s",
          }}
        >
          {toolsOpen ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
            </svg>
          )}
        </button>

        {/* Tool buttons — expand below */}
        {toolsOpen && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              animation: "fadeIn 0.15s ease",
            }}
          >
            {/* Zoom in */}
            <button
              onClick={handleZoomIn}
              title="Zoom in"
              aria-label="Zoom in"
              style={TOOL_BTN}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {/* Zoom out */}
            <button
              onClick={handleZoomOut}
              title="Zoom out"
              aria-label="Zoom out"
              style={TOOL_BTN}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {/* Reset */}
            <button
              onClick={handleReset}
              title="Reset view"
              aria-label="Reset view"
              style={TOOL_BTN}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Node navigation: prev/next */}
      {nodeOrder.length > 1 && (
        <div
          style={{
            position: "absolute",
            right: 10,
            bottom: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            zIndex: 20,
          }}
        >
          <button
            onClick={navPrev}
            disabled={atStart}
            aria-label="Previous node"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--fc-border)",
              background: "var(--fc-surface)",
              color: "var(--fc-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              opacity: atStart ? 0.3 : 0.8,
              touchAction: "manipulation",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            onClick={navNext}
            disabled={atEnd}
            aria-label="Next node"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--fc-border)",
              background: "var(--fc-surface)",
              color: "var(--fc-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              opacity: atEnd ? 0.3 : 0.8,
              touchAction: "manipulation",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export const FlowCanvas3D = memo(FlowCanvas3DInner);
