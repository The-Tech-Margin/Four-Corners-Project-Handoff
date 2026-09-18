/**
 * Canvas ↔ Store Bridge
 *
 * Bidirectional sync between the @fourcorners/canvas and the
 * Zustand store. This is the ONLY code that reads/writes the store
 * from the sketchboard context — shapes never import the store directly.
 *
 * Hydration uses the Canvas imperative API (canvas.addShape) to render
 * shapes directly on the Konva content layer.
 */

import { useState, useCallback } from "react";
import type { CanvasDocument, ShapeJSON, ConnectionJSON, BaseShape } from "@fourcorners/canvas";
import { ShapeRegistry } from "@fourcorners/canvas";
import { useFourCornersStore } from "@/lib/store";
import type { CanvasPreset } from "@/components/sketchboard/presets";
import { CORNER_LABELS, type FieldMapping } from "@/components/sketchboard/shapes/types";
import { FIELD_INDEX } from "@/lib/field-registry";

// Re-export layout from shared module (avoids Konva dependency for importers that only need layout)
export { ZW, ZH, GAP, getLayout } from "@/lib/canvas-layout";
import { getLayout } from "@/lib/canvas-layout";
import { applyTreeLayout2D } from "@/app/explore/[slug]/components/explore-layout";
import { buildExploreHierarchy } from "@/app/explore/[slug]/components/use-explore-hierarchy";

import { resolveCornerColors } from "@/components/sketchboard/shapes/types";

// Default desktop positions (for backward compat with zone-hit-test etc.)
export const ZONE_POSITIONS = getLayout().positions;
export const PHOTO_X = getLayout().photoX;
export const PHOTO_Y = getLayout().photoY;

type StoreState = ReturnType<typeof useFourCornersStore.getState>;

// ── Mode-based zone visibility ────────────────────────────────────────

/** Determine which canvas zones are visible given the current data mode */
export function getVisibleZones(state: StoreState): Set<string> {
  const mode = state.mode;
  // Default: show all zones (standard/complete, or when mode is not set)
  if (!mode || mode === "standard" || mode === "complete") {
    return new Set(["context", "links", "backstory", "cc"]);
  }
  // Minimal: cc always shown, others based on selectedCorners
  const visible = new Set(["cc"]);
  if (state.selectedCorners?.backstory) visible.add("backstory");
  if (state.selectedCorners?.relatedImagery) visible.add("context");
  if (state.selectedCorners?.links) visible.add("links");
  return visible;
}

// ── Pure conversion: Store → CanvasDocument ──────────────────────────

export function storeToCanvasDocument(
  state: StoreState,
  preset?: CanvasPreset,
  viewportWidth?: number,
  options?: { treeLayout?: boolean },
): CanvasDocument {
  const layout = getLayout(viewportWidth);
  const shapes: ShapeJSON[] = [];
  const conns: ConnectionJSON[] = [];
  const zones: CanvasDocument["zones"] = [];
  const visibleZones = getVisibleZones(state);

  // 1. Corner zones (only visible ones) — detect empty zones for UX hints
  const zoneHasContent: Record<string, boolean> = {
    context: (state.context?.length ?? 0) > 0,
    links: (state.links?.length ?? 0) > 0,
    backstory: !!(state.backStory?.text || state.backStory?.author || state.backStory?.publication || state.voiceTranscriptions?.some((v) => v.text)),
    cc: !!(state.creativeCommons?.copyright || state.creativeCommons?.description || state.photographerInfo?.bio || state.photographerInfo?.website || state.ethics?.customEthicsText),
  };

  (["context", "links", "backstory", "cc"] as const).forEach((corner) => {
    if (!visibleZones.has(corner)) return;
    const pos = layout.positions[corner];
    const empty = !zoneHasContent[corner];
    zones.push({
      id: `zone-${corner}`,
      label: corner.toUpperCase(),
      bounds: { x: pos.x, y: pos.y, width: layout.zw, height: layout.zh },
      shapeIds: [],
    });
    shapes.push({
      id: `zone-${corner}`,
      type: "zone",
      x: pos.x,
      y: pos.y,
      width: layout.zw,
      height: layout.zh,
      rotation: 0,
      locked: true,
      data: { label: CORNER_LABELS[corner] || corner.toUpperCase(), color: resolveCornerColors()[corner] || "#666", collapsed: !empty },
      metadata: { corner, empty },
    });
  });

  // 2. PhotoCard at center — always present as the starting point
  const photoW = Math.min(400, layout.zw * 0.8);
  const photoH = photoW * 0.75;
  shapes.push({
    id: "photo-main",
    type: "photo-card",
    x: layout.photoX,
    y: layout.photoY,
    width: photoW,
    height: photoH,
    rotation: 0,
    locked: false,
    data: {
      imageUrl: state.imageSrc || "",
      caption: state.creativeCommons?.description || "",
      credit: state.backStory?.author || "",
      nfLabel: !!(state.ethics?.noManipulation && state.ethics?.noStaging),
    },
    metadata: { empty: !state.imageSrc },
  });

  // Structural connections: photo → zones (always present for tree layout,
  // even when no image is set — the tree structure IS the 4C structure)
  (["context", "links", "backstory", "cc"] as const).forEach((corner) => {
    if (visibleZones.has(corner)) {
      conns.push({ id: `conn-photo-zone-${corner}`, fromShapeId: "photo-main", toShapeId: `zone-${corner}`, type: "parent-child" });
    }
  });

  // 3. Preset shapes OR default field hydration
  if (preset) {
    preset.shapes.forEach((def, i) => {
      const fm = def.props.fieldMapping as FieldMapping | null;
      let content = "";
      if (fm) {
        const [section, field] = fm.split(".");
        content = getNestedValue(state as unknown as Record<string, unknown>, section, field);
      }

      shapes.push({
        id: `preset-${def.type}-${i}`,
        type: def.type,
        x: def.x,
        y: def.y,
        width: (def.props.w as number) || 260,
        height: (def.props.h as number) || 120,
        rotation: 0,
        locked: false,
        data: {
          ...(def.type === "text-block" ? { content, fieldMapping: fm, cornerAffinity: def.props.cornerAffinity } : {}),
          ...(def.type === "voice-note" ? { transcriptionText: content, fieldMapping: fm, cornerAffinity: def.props.cornerAffinity } : {}),
        },
        metadata: { fieldMapping: fm, cornerAffinity: def.props.cornerAffinity },
      });
    });
  } else {
    hydratePopulatedShapes(shapes, conns, state, layout, visibleZones);
  }

  // 4. Related images (context items) — only when context zone is visible
  if (visibleZones.has("context")) {
    const ctxPos = layout.positions.context;
    const ctxItemW = Math.min(180, (layout.zw - 60) / 3);
    state.context?.forEach((ctx, i) => {
      shapes.push({
        id: `ctx-${i}`,
        type: "context-item",
        x: ctxPos.x + 20 + (i % 3) * (ctxItemW + 15),
        y: ctxPos.y + 30 + Math.floor(i / 3) * (ctxItemW + 40),
        width: ctxItemW,
        height: ctxItemW + 20,
        rotation: 0,
        locked: false,
        data: {
          imageSrc: ctx.src || ctx.storage_url || ctx.thumbnail_storage_url || "",
          caption: ctx.caption || "",
          mediaType: ctx.type || "image",
          contextIndex: i,
        },
        metadata: {},
      });
      conns.push({ id: `conn-ctx-${i}`, fromShapeId: "zone-context", toShapeId: `ctx-${i}`, type: "parent-child" });
    });
  }

  // 5. Links — only when links zone is visible
  if (visibleZones.has("links")) {
    const linksPos = layout.positions.links;
    const linkW = Math.min(240, layout.zw - 40);
    state.links?.forEach((link, i) => {
      shapes.push({
        id: `link-${i}`,
        type: "link-card",
        x: linksPos.x + 20,
        y: linksPos.y + 30 + i * 84,
        width: linkW,
        height: 72,
        rotation: 0,
        locked: false,
        data: {
          url: link.url || "",
          title: link.title || "",
          domain: extractDomain(link.url || ""),
          linkIndex: i,
        },
        metadata: {},
      });
      conns.push({ id: `conn-link-${i}`, fromShapeId: "zone-links", toShapeId: `link-${i}`, type: "parent-child" });
    });
  }

  // 6. Voice transcriptions — only when backstory zone is visible
  if (visibleZones.has("backstory")) {
    const bsPos = layout.positions.backstory;
    const voiceW = Math.min(280, layout.zw - 40);
    state.voiceTranscriptions?.forEach((vt, i) => {
      shapes.push({
        id: `voice-${vt.id}`,
        type: "voice-note",
        x: bsPos.x + 20,
        y: bsPos.y + layout.zh - 160 - i * 155,
        width: voiceW,
        height: 140,
        rotation: 0,
        locked: false,
        data: {
          audioUrl: vt.audioDataUrl || undefined,
          duration: vt.duration || 0,
          transcriptionText: vt.text || "",
          transcriptionId: vt.id,
        },
        metadata: { fieldMapping: null, cornerAffinity: "backstory" },
      });
      conns.push({ id: `conn-voice-${vt.id}`, fromShapeId: "zone-backstory", toShapeId: `voice-${vt.id}`, type: "parent-child" });
    });
  }

  const doc: CanvasDocument = {
    version: "1.0",
    canvas: {
      width: layout.totalW,
      height: layout.totalH,
      camera: { x: 0, y: 0, zoom: preset?.zoom || 0.8 },
      gridSize: 20,
    },
    shapes,
    zones,
    connections: conns,
  };

  // Apply d3 tree layout when requested (mobile sketchboard)
  if (options?.treeLayout) {
    const hierarchy = buildExploreHierarchy(doc.shapes, doc.connections);
    if (hierarchy) {
      const isMobile = (viewportWidth ?? 800) < 640;
      return applyTreeLayout2D(doc, hierarchy, isMobile);
    }
  }

  return doc;
}

// ── Pure conversion: CanvasDocument → Store updates ──────────────────

export function canvasDocumentToStore(doc: CanvasDocument): void {
  const store = useFourCornersStore.getState();
  let changed = false;

  for (const shape of doc.shapes) {
    // Sync text blocks back to store
    if (shape.type === "text-block") {
      const fm = (shape.metadata?.fieldMapping || shape.data?.fieldMapping) as FieldMapping | null;
      if (!fm) continue;

      const content = (shape.data?.content as string) || "";
      const [section, field] = fm.split(".");
      const currentValue = getNestedValue(store as unknown as Record<string, unknown>, section, field);

      if (content !== currentValue) {
        changed = true;
        setStoreField(section, field, content);
      }
    }

    // Sync voice transcription text edits
    if (shape.type === "voice-note") {
      const transcriptionId = shape.data?.transcriptionId as string | undefined;
      const text = (shape.data?.transcriptionText as string) || "";
      if (transcriptionId && text) {
        const existing = store.voiceTranscriptions?.find((v) => v.id === transcriptionId);
        if (existing && existing.text !== text) {
          changed = true;
          const updated = store.voiceTranscriptions.map((v) =>
            v.id === transcriptionId ? { ...v, text } : v,
          );
          useFourCornersStore.setState({ voiceTranscriptions: updated });
        }
      }
    }
  }

  if (changed) {
    useFourCornersStore.getState().markUnsaved();
  }
}

// ── Hook ─────────────────────────────────────────────────────────────

interface UseCanvasBridgeOptions {
  isReadOnly: boolean;
}

export function useCanvasBridge(options: UseCanvasBridgeOptions) {
  const [shapes, setShapes] = useState<BaseShape[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  const hydrateCanvas = useCallback(
    (preset?: CanvasPreset) => {
      const state = useFourCornersStore.getState();
      const doc = storeToCanvasDocument(state, preset);

      // Deserialize ShapeJSON into BaseShape instances for React rendering
      const instances: BaseShape[] = [];
      for (const shapeJson of doc.shapes) {
        const ShapeClass = ShapeRegistry.get(shapeJson.type);
        if (!ShapeClass) continue;
        const instance = new ShapeClass();
        instance.deserialize(shapeJson);
        instances.push(instance);
      }

      setShapes(instances);
      setIsHydrated(true);
    },
    [],
  );

  return {
    isHydrated,
    shapes,
    shapeCount: shapes.length,
    hydrateCanvas,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Long-form fields that get taller text-blocks on the canvas */
const NARRATIVE_FIELDS = new Set(["backStory.text", "creativeCommons.description"]);

/**
 * Get populated text fields for a canvas corner from the field-registry.
 * Returns only fields with non-empty string content.
 */
function getPopulatedFields(
  corner: "backstory" | "cc",
  state: StoreState,
): { path: string; value: string }[] {
  return FIELD_INDEX.getCanvasTextFields(corner)
    .map((f) => {
      const [section, field] = f.path.split(".");
      const value = getNestedValue(
        state as unknown as Record<string, unknown>,
        section,
        field,
      );
      return { path: f.path, value };
    })
    .filter((f) => f.value.trim() !== "");
}

/**
 * Only create text-block shapes for fields that actually have content.
 * Empty fields show nothing — the zone overlays guide the user instead.
 */
function hydratePopulatedShapes(
  shapes: ShapeJSON[],
  conns: ConnectionJSON[],
  state: StoreState,
  layout: ReturnType<typeof getLayout>,
  visibleZones: Set<string>,
) {
  const pad = 20;
  const fieldW = Math.min(300, layout.zw - pad * 2);
  const mode = state.mode;

  // Backstory text blocks — only when backstory zone is visible
  if (visibleZones.has("backstory")) {
  const backstoryFields = getPopulatedFields("backstory", state);
  const bsPos = layout.positions.backstory;

  // Don't show metadata-only fields (date, pubUrl) unless substantive content exists
  const SUBSTANTIVE_BS = new Set(["backStory.text", "backStory.author", "backStory.publication"]);
  const hasSubstantive = backstoryFields.some((f) => SUBSTANTIVE_BS.has(f.path));
  const META_ONLY_BS = new Set(["backStory.date", "backStory.publicationUrl"]);


  // In minimal mode, only show backstory.text (not publication/date fields)
  const minimalBackstoryPaths = new Set(["backStory.text", "backStory.author"]);

  let bsY = 0;
  backstoryFields.filter((f) => {
    if (mode === "minimal" && !minimalBackstoryPaths.has(f.path)) return false;
    if (!hasSubstantive && META_ONLY_BS.has(f.path)) return false;
    return true;
  }).forEach((f) => {
    const isNarrative = NARRATIVE_FIELDS.has(f.path);
    const h = isNarrative ? Math.min(140, layout.zh * 0.35) : Math.min(60, layout.zh * 0.15);
    shapes.push({
      id: `bs-${f.path}`,
      type: "text-block",
      x: bsPos.x + pad,
      y: bsPos.y + 30 + bsY,
      width: fieldW,
      height: h,
      rotation: 0,
      locked: false,
      data: { content: f.value, fieldMapping: f.path, cornerAffinity: "backstory" },
      metadata: { fieldMapping: f.path, cornerAffinity: "backstory" },
    });
    conns.push({ id: `conn-bs-${f.path}`, fromShapeId: "zone-backstory", toShapeId: `bs-${f.path}`, type: "parent-child" });
    bsY += h + 10;
  });
  } // end backstory gate

  // Authorship text blocks — cc is always visible
  const ccFields = getPopulatedFields("cc", state);
  const ccPos = layout.positions.cc;
  const ccFieldW = Math.min(280, layout.zw - pad * 2);

  // In minimal mode, only show caption + copyright (not photographer info fields)
  const minimalCcPaths = new Set(["creativeCommons.description", "creativeCommons.copyright"]);
  const filteredCcFields = mode === "minimal"
    ? ccFields.filter((f) => minimalCcPaths.has(f.path))
    : ccFields;

  let ccY = 0;
  filteredCcFields.forEach((f) => {
    const isNarrative = NARRATIVE_FIELDS.has(f.path);
    const h = isNarrative ? Math.min(100, layout.zh * 0.25) : Math.min(55, layout.zh * 0.14);
    shapes.push({
      id: `cc-${f.path}`,
      type: "text-block",
      x: ccPos.x + pad,
      y: ccPos.y + 30 + ccY,
      width: ccFieldW,
      height: h,
      rotation: 0,
      locked: false,
      data: { content: f.value, fieldMapping: f.path, cornerAffinity: "cc" },
      metadata: { fieldMapping: f.path, cornerAffinity: "cc" },
    });
    conns.push({ id: `conn-cc-${f.path}`, fromShapeId: "zone-cc", toShapeId: `cc-${f.path}`, type: "parent-child" });
    ccY += h + 8;
  });

  // Read-only summaries (gated by mode)
  const summaries: string[] = [];

  // Ethics summary — shown in standard + complete
  if (mode !== "minimal") {
    const ethicsFlags: string[] = [];
    if (state.ethics?.noManipulation) ethicsFlags.push("No manipulation");
    if (state.ethics?.noStaging) ethicsFlags.push("No staging");
    if (state.ethics?.informedConsent) ethicsFlags.push("Informed consent");
    if (state.ethics?.identityProtected) ethicsFlags.push("Identity protected");
    if (state.ethics?.aiAltered) ethicsFlags.push("AI altered");
    if (ethicsFlags.length > 0) summaries.push(ethicsFlags.join(" · "));
  }

  // Location + camera metadata — complete mode only
  if (mode === "complete") {
    if (state.location?.formattedLocation) {
      summaries.push(`📍 ${state.location.formattedLocation}`);
    }

    const camParts: string[] = [];
    if (state.photoMetadata?.equipment?.cameraMake) camParts.push(state.photoMetadata.equipment.cameraMake);
    if (state.photoMetadata?.equipment?.cameraModel) camParts.push(state.photoMetadata.equipment.cameraModel);
    if (state.photoMetadata?.equipment?.lensModel) camParts.push(state.photoMetadata.equipment.lensModel);
    if (camParts.length > 0) summaries.push(camParts.join(" · "));
  }

  summaries.forEach((text, i) => {
    shapes.push({
      id: `cc-summary-${i}`,
      type: "text-block",
      x: ccPos.x + pad,
      y: ccPos.y + 30 + ccY,
      width: ccFieldW,
      height: 36,
      rotation: 0,
      locked: true,
      data: { content: text, fieldMapping: null, cornerAffinity: "cc", fontSize: 11 },
      metadata: { readOnly: true, cornerAffinity: "cc" },
    });
    ccY += 44;
  });
}

export function getNestedValue(obj: Record<string, unknown>, section: string, field: string): string {
  const sectionObj = obj[section] as Record<string, unknown> | undefined;
  if (!sectionObj) return "";
  return (sectionObj[field] as string) || "";
}

export function setStoreField(section: string, field: string, value: string) {
  const store = useFourCornersStore.getState();
  switch (section) {
    case "backStory":
      store.updateBackStory(field, value);
      break;
    case "creativeCommons":
      store.updateCreativeCommons(field, value);
      break;
    case "photographerInfo":
      store.updatePhotographerInfo(field, value);
      break;
    case "ethics":
      store.updateEthics(field, value);
      break;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
