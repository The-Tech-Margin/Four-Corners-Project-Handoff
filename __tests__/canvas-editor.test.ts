/**
 * Canvas Editor shape generation tests.
 *
 * Verifies that storeToCanvasDocument produces the correct shapes
 * for a populated project — ensuring canvas and form produce
 * identical metadata.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TEST_STORE_STATE, EXPECTED_CANVAS_SHAPES } from "./fixtures/test-project";

// Mock store
let mockState: Record<string, unknown> = {};
vi.mock("@/lib/store", () => ({
  useFourCornersStore: {
    getState: () => mockState,
    setState: (partial: Record<string, unknown>) => {
      Object.assign(mockState, partial);
    },
  },
}));

// Mock @fourcorners/canvas to avoid Konva/canvas dependency in Node
vi.mock("@fourcorners/canvas", () => ({
  ShapeRegistry: { get: () => undefined, register: () => {} },
  Canvas: class {},
  BaseShape: class {},
}));

// Mock canvas shapes module
vi.mock("@/components/sketchboard/shapes/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/sketchboard/shapes/types")>();
  return {
    ...actual,
    resolveCornerColors: () => ({
      backstory: "#09fff0",
      context: "#a855f7",
      links: "#84cc16",
      cc: "#f97316",
    }),
  };
});

import { storeToCanvasDocument, getLayout } from "@/hooks/use-canvas-bridge";

beforeEach(() => {
  mockState = { ...TEST_STORE_STATE };
});

describe("Canvas Editor — Shape Generation", () => {
  describe("storeToCanvasDocument with populated data", () => {
    it("always generates 4 zone shapes", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const zones = doc.shapes.filter((s) => s.type === "zone");
      expect(zones).toHaveLength(EXPECTED_CANVAS_SHAPES.zones);
      expect(zones.map((z) => z.data.label).sort()).toEqual(
        ["AUTHORSHIP", "BACKSTORY", "IMAGERY", "LINKS"],
      );
    });

    it("generates PhotoCard with empty metadata when imageSrc is null", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const photos = doc.shapes.filter((s) => s.type === "photo-card");
      expect(photos).toHaveLength(1);
      expect(photos[0].metadata.empty).toBe(true);
    });

    it("generates PhotoCard when imageSrc is set", () => {
      mockState = { ...TEST_STORE_STATE, imageSrc: "data:image/jpeg;base64,abc" };
      const doc = storeToCanvasDocument(mockState as any);
      const photos = doc.shapes.filter((s) => s.type === "photo-card");
      expect(photos).toHaveLength(1);
      expect(photos[0].data.imageUrl).toBe("data:image/jpeg;base64,abc");
      expect(photos[0].data.caption).toBe(TEST_STORE_STATE.creativeCommons.description);
    });

    it("generates context-item shapes for each context entry", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const items = doc.shapes.filter((s) => s.type === "context-item");
      expect(items).toHaveLength(TEST_STORE_STATE.context.length);
      items.forEach((item, i) => {
        expect(item.data.contextIndex).toBe(i);
        expect(item.data.mediaType).toBe("image");
      });
    });

    it("generates text-block shapes only for populated backstory fields", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const textBlocks = doc.shapes.filter(
        (s) => s.type === "text-block" && s.metadata?.cornerAffinity === "backstory",
      );
      // Only backStory.text and backStory.date are populated
      expect(textBlocks.length).toBe(EXPECTED_CANVAS_SHAPES.textBlocks);
      const fields = textBlocks.map((t) => t.metadata?.fieldMapping);
      expect(fields).toContain("backStory.text");
      expect(fields).toContain("backStory.date");
      expect(fields).not.toContain("backStory.author"); // empty
    });

    it("generates text-block shapes only for populated CC fields", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const ccBlocks = doc.shapes.filter(
        (s) => s.type === "text-block" && s.metadata?.cornerAffinity === "cc" && !s.metadata?.readOnly,
      );
      expect(ccBlocks.length).toBe(EXPECTED_CANVAS_SHAPES.ccTextBlocks);
      const fields = ccBlocks.map((t) => t.metadata?.fieldMapping);
      expect(fields).toContain("creativeCommons.copyright");
      expect(fields).toContain("creativeCommons.description");
    });

    it("generates no link-card shapes when links array is empty", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const links = doc.shapes.filter((s) => s.type === "link-card");
      expect(links).toHaveLength(0);
    });

    it("generates voice-note shapes for transcriptions", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const voices = doc.shapes.filter((s) => s.type === "voice-note");
      expect(voices).toHaveLength(EXPECTED_CANVAS_SHAPES.voiceNotes);
      expect(voices[0].data.transcriptionId).toBe(TEST_STORE_STATE.voiceTranscriptions[0].id);
    });

    it("sets correct zone colors from resolved corner colors", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const zones = doc.shapes.filter((s) => s.type === "zone");
      const imageryZone = zones.find((z) => z.data.label === "IMAGERY");
      expect(imageryZone?.data.color).toBe("#a855f7");
    });
  });

  describe("Responsive layout", () => {
    it("returns 2x2 grid for desktop viewport", () => {
      const layout = getLayout(1280);
      expect(layout.zw).toBe(500);
      expect(layout.zh).toBe(400);
      expect(layout.positions.links.x).toBeGreaterThan(0); // right column
      expect(layout.positions.links.y).toBe(0); // top row
    });

    it("returns stacked layout for mobile viewport", () => {
      const layout = getLayout(375);
      expect(layout.zw).toBeLessThan(400);
      expect(layout.positions.links.x).toBe(0); // same column
      expect(layout.positions.links.y).toBeGreaterThan(0); // below context
      expect(layout.positions.backstory.y).toBeGreaterThan(layout.positions.links.y);
    });

    it("stacks all 4 zones vertically on mobile", () => {
      const layout = getLayout(375);
      const yValues = Object.values(layout.positions).map((p) => p.y);
      const sorted = [...yValues].sort((a, b) => a - b);
      // All should be at different y positions (stacked)
      expect(new Set(sorted).size).toBe(4);
    });
  });

  describe("Canvas ↔ Form parity", () => {
    it("text-block content matches store field values exactly", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const textBlocks = doc.shapes.filter((s) => s.type === "text-block" && s.data.fieldMapping);

      for (const block of textBlocks) {
        const fm = (block.data.fieldMapping || block.metadata?.fieldMapping) as string | undefined;
        if (!fm) continue;
        const [section, field] = fm.split(".");
        const storeValue = (mockState as any)[section]?.[field] ?? "";
        expect(block.data.content).toBe(storeValue);
      }
    });

    it("context-item storage URLs match store context array", () => {
      const doc = storeToCanvasDocument(mockState as any);
      const items = doc.shapes.filter((s) => s.type === "context-item");

      items.forEach((item, i) => {
        const storeCtx = TEST_STORE_STATE.context[i];
        expect(item.data.imageSrc).toBe((storeCtx as any).src || storeCtx.storage_url || "");
      });
    });
  });
});
