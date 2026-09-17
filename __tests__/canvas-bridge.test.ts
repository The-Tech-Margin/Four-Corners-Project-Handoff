/**
 * Tests for canvas bridge conversion functions.
 * These test the pure data transformation logic without requiring
 * a canvas runtime or DOM.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  storeToCanvasDocument,
  canvasDocumentToStore,
  getNestedValue,
  setStoreField,
  ZONE_POSITIONS,
  ZW,
  ZH,
  GAP,
  PHOTO_X,
  PHOTO_Y,
} from "@/hooks/use-canvas-bridge";

// Mock the store
vi.mock("@/lib/store", () => {
  let state: Record<string, unknown> = {};
  return {
    useFourCornersStore: {
      getState: () => state,
      setState: (partial: Record<string, unknown>) => {
        state = { ...state, ...partial };
      },
      __setState: (s: Record<string, unknown>) => { state = s; },
    },
  };
});

// Mock @fourcorners/canvas to avoid Konva/canvas Node dependency
vi.mock("@fourcorners/canvas", () => ({
  ShapeRegistry: { get: () => undefined, register: () => {} },
  Canvas: class {},
  BaseShape: class {},
}));

// Mock @fourcorners/canvas/react useBridge
vi.mock("@fourcorners/canvas/react", () => ({
  useBridge: vi.fn(() => ({
    sync: vi.fn(),
    load: vi.fn(),
    isDirty: false,
    isSaving: false,
    lastSaved: null,
  })),
  useCanvas: vi.fn(),
  useShapes: vi.fn(),
}));

const { useFourCornersStore } = await import("@/lib/store");

function makeStoreState(overrides: Record<string, unknown> = {}) {
  return {
    imageSrc: "data:image/png;base64,test",
    backStory: { text: "A story", author: "Alice", publication: "Times", date: "2024-01-01" },
    creativeCommons: { description: "A photo", copyright: "2024 Alice" },
    photographerInfo: { bio: "Photographer", website: "https://alice.com", contact: "alice@test.com" },
    ethics: { noManipulation: true, noStaging: true, customEthicsText: "" },
    context: [
      { src: "img1.jpg", caption: "Context 1", type: "image" },
      { src: "img2.jpg", caption: "Context 2", type: "video" },
    ],
    links: [
      { url: "https://example.com", title: "Example", source: "web" },
    ],
    voiceTranscriptions: [
      { id: "vt-1", text: "Transcription text", audioDataUrl: "data:audio/webm;base64,test", duration: 5.2 },
    ],
    markUnsaved: vi.fn(),
    updateBackStory: vi.fn(),
    updateCreativeCommons: vi.fn(),
    updatePhotographerInfo: vi.fn(),
    updateEthics: vi.fn(),
    ...overrides,
  };
}

describe("storeToCanvasDocument", () => {
  it("creates zone shapes for all four corners", () => {
    const state = makeStoreState();
    (useFourCornersStore as any).__setState(state);

    const doc = storeToCanvasDocument(state as any);
    const zones = doc.shapes.filter((s) => s.type === "zone");
    expect(zones).toHaveLength(4);

    const zoneIds = zones.map((z) => z.id);
    expect(zoneIds).toContain("zone-context");
    expect(zoneIds).toContain("zone-links");
    expect(zoneIds).toContain("zone-backstory");
    expect(zoneIds).toContain("zone-cc");
  });

  it("creates a photo-card at the center position", () => {
    const state = makeStoreState();
    const doc = storeToCanvasDocument(state as any);
    const photo = doc.shapes.find((s) => s.id === "photo-main");

    expect(photo).toBeDefined();
    expect(photo!.type).toBe("photo-card");
    expect(photo!.x).toBe(PHOTO_X);
    expect(photo!.y).toBe(PHOTO_Y);
    expect(photo!.data.imageUrl).toBe("data:image/png;base64,test");
    expect(photo!.data.caption).toBe("A photo");
    expect(photo!.data.nfLabel).toBe(true);
  });

  it("creates text-block shapes for backstory fields", () => {
    const state = makeStoreState();
    const doc = storeToCanvasDocument(state as any);
    const backstoryBlocks = doc.shapes.filter(
      (s) => s.type === "text-block" && s.metadata?.cornerAffinity === "backstory",
    );

    expect(backstoryBlocks.length).toBeGreaterThanOrEqual(4);
    const storyBlock = backstoryBlocks.find(
      (s) => s.metadata?.fieldMapping === "backStory.text",
    );
    expect(storyBlock).toBeDefined();
    expect(storyBlock!.data.content).toBe("A story");
  });

  it("creates context-item shapes for each context entry", () => {
    const state = makeStoreState();
    const doc = storeToCanvasDocument(state as any);
    const ctxShapes = doc.shapes.filter((s) => s.type === "context-item");

    expect(ctxShapes).toHaveLength(2);
    expect(ctxShapes[0].data.imageSrc).toBe("img1.jpg");
    expect(ctxShapes[1].data.mediaType).toBe("video");
  });

  it("creates link-card shapes for each link", () => {
    const state = makeStoreState();
    const doc = storeToCanvasDocument(state as any);
    const linkShapes = doc.shapes.filter((s) => s.type === "link-card");

    expect(linkShapes).toHaveLength(1);
    expect(linkShapes[0].data.url).toBe("https://example.com");
    expect(linkShapes[0].data.domain).toBe("example.com");
  });

  it("creates voice-note shapes for transcriptions", () => {
    const state = makeStoreState();
    const doc = storeToCanvasDocument(state as any);
    const voiceShapes = doc.shapes.filter((s) => s.type === "voice-note");

    expect(voiceShapes).toHaveLength(1);
    expect(voiceShapes[0].data.transcriptionId).toBe("vt-1");
    expect(voiceShapes[0].data.duration).toBe(5.2);
  });

  it("handles empty store gracefully", () => {
    const state = makeStoreState({
      imageSrc: null,
      backStory: {},
      creativeCommons: {},
      photographerInfo: {},
      ethics: {},
      context: [],
      links: [],
      voiceTranscriptions: [],
    });

    const doc = storeToCanvasDocument(state as any);
    // Should have 4 zones (no photo card when imageSrc is null, no text blocks when fields empty)
    expect(doc.shapes.length).toBeGreaterThanOrEqual(4);
    expect(doc.version).toBe("1.0");
  });

  it("uses preset shapes when a preset is provided", () => {
    const state = makeStoreState();
    const preset = {
      id: "test",
      label: "Test",
      description: "Test preset",
      zoom: 0.8,
      shapes: [
        {
          type: "text-block" as const,
          x: 100,
          y: 200,
          props: { w: 300, h: 100, cornerAffinity: "backstory", fieldMapping: "backStory.text" },
        },
      ],
    };

    const doc = storeToCanvasDocument(state as any, preset);
    const presetShapes = doc.shapes.filter((s) => s.id.startsWith("preset-"));
    expect(presetShapes).toHaveLength(1);
    expect(presetShapes[0].data.content).toBe("A story");
  });
});

describe("getNestedValue", () => {
  it("returns nested field value", () => {
    const obj = { backStory: { text: "hello" } };
    expect(getNestedValue(obj, "backStory", "text")).toBe("hello");
  });

  it("returns empty string for missing section", () => {
    expect(getNestedValue({}, "missing", "field")).toBe("");
  });

  it("returns empty string for missing field", () => {
    const obj = { backStory: {} };
    expect(getNestedValue(obj, "backStory", "missing")).toBe("");
  });
});

describe("zone layout constants", () => {
  it("zones are positioned correctly", () => {
    expect(ZONE_POSITIONS.context).toEqual({ x: 0, y: 0 });
    expect(ZONE_POSITIONS.links).toEqual({ x: ZW + GAP, y: 0 });
    expect(ZONE_POSITIONS.backstory).toEqual({ x: 0, y: ZH + GAP });
    expect(ZONE_POSITIONS.cc).toEqual({ x: ZW + GAP, y: ZH + GAP });
  });

  it("photo is centered between zones", () => {
    expect(PHOTO_X).toBeGreaterThan(0);
    expect(PHOTO_Y).toBeGreaterThan(0);
    expect(PHOTO_X).toBeLessThan(ZW);
    expect(PHOTO_Y).toBeLessThan(ZH);
  });
});
