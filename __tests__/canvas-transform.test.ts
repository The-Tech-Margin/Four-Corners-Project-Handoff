/**
 * Tests for the explore page transform function.
 * Verifies CanvasDocument generation from ProjectRecord using the
 * editor's getLayout() 2×2 grid for both desktop and mobile layouts.
 */

import { describe, it, expect } from "vitest";
import { transformToCanvasDocument } from "@/app/explore/[slug]/components/transform";
import type { ProjectRecord } from "@/lib/db/projects";

function makeProject(overrides: Partial<ProjectRecord["metadata"]> = {}): ProjectRecord {
  return {
    id: "test-id",
    slug: "test-project",
    title: "Test Project",
    user_id: "user-1",
    author: "Test Author",
    date: "2024-06-15",
    published: true,
    in_gallery: true,
    main_image_url: "https://example.com/photo.jpg",
    metadata: {
      backStory: { text: "A backstory", author: "Alice", publication: "Daily News", date: "2024-06-15" },
      creativeCommons: { description: "Caption text", copyright: "2024 Alice" },
      photographerInfo: { bio: "A photographer", website: "https://alice.com", contact: "alice@test.com" },
      ethics: { noManipulation: true, noStaging: false, customEthicsText: "Ethics note" },
      context: [
        { id: "ctx-1", src: "img1.jpg", caption: "Image 1", type: "image" },
        { id: "ctx-2", src: "img2.jpg", caption: "Image 2", type: "video" },
      ],
      links: [
        { url: "https://example.com", title: "Example", source: "web" },
        { url: "https://test.org", title: "Test", source: "ref" },
      ],
      location: { formattedLocation: "New York, NY", latitude: 40.7, longitude: -74.0 },
      voiceTranscriptions: [
        { id: "v1", text: "Voice note text", recordingId: "r1", transcribedAt: "2024-06-15", fieldId: "backStory.text" },
      ],
      ...overrides,
    },
  } as unknown as ProjectRecord;
}

describe("transformToCanvasDocument", () => {
  describe("grid layout (desktop)", () => {
    it("creates a center photo-card shape", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const photo = doc.shapes.find((s) => s.id === "photo-main");

      expect(photo).toBeDefined();
      expect(photo!.type).toBe("photo-card");
      expect(photo!.data.imageUrl).toBe("https://example.com/photo.jpg");
    });

    it("creates zone shapes for all 4 corners", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const zones = doc.shapes.filter((s) => s.type === "zone");

      expect(zones.length).toBe(4);
    });

    it("marks empty corners with empty metadata", () => {
      const doc = transformToCanvasDocument(
        makeProject({
          context: [],
          links: [],
          backStory: {} as any,
          photographerInfo: {} as any,
          ethics: {} as any,
          creativeCommons: {} as any,
          location: undefined,
          photoMetadata: undefined,
          voiceTranscriptions: [],
        }),
        "grid",
      );
      const zones = doc.shapes.filter((s) => s.type === "zone");
      const placeholders = zones.filter((s) => s.metadata?.empty);

      expect(placeholders.length).toBe(4);
      // All placeholder zones share the same locked state
      const lockedStates = new Set(placeholders.map((z) => z.locked));
      expect(lockedStates.size).toBe(1);
    });

    it("creates context-item shapes for context items", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const ctxShapes = doc.shapes.filter(
        (s) => s.metadata?.parentCorner === "context",
      );

      expect(ctxShapes).toHaveLength(2);
    });

    it("creates link-card shapes for links", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const linkShapes = doc.shapes.filter(
        (s) => s.metadata?.parentCorner === "links",
      );

      expect(linkShapes).toHaveLength(2);
      expect(linkShapes[0].data.domain).toBe("example.com");
    });

    it("positions zones in a 2x2 grid", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const zones = doc.shapes.filter((s) => s.type === "zone");

      const context = zones.find((z) => z.metadata?.corner === "context");
      const links = zones.find((z) => z.metadata?.corner === "links");
      const backstory = zones.find((z) => z.metadata?.corner === "backstory");
      const cc = zones.find((z) => z.metadata?.corner === "cc");

      // context top-left (0,0), links top-right, backstory bottom-left, cc bottom-right
      expect(context!.x).toBe(0);
      expect(context!.y).toBe(0);
      expect(links!.x).toBeGreaterThan(0);
      expect(links!.y).toBe(0);
      expect(backstory!.x).toBe(0);
      expect(backstory!.y).toBeGreaterThan(0);
      expect(cc!.x).toBeGreaterThan(0);
      expect(cc!.y).toBeGreaterThan(0);
    });

    it("limits context items to 12", () => {
      const manyItems = Array.from({ length: 20 }, (_, i) => ({
        id: `ctx-${i}`,
        src: `img${i}.jpg`,
        caption: `Image ${i}`,
        type: "image" as const,
        sourceType: "upload" as const,
      }));

      const doc = transformToCanvasDocument(makeProject({ context: manyItems }), "grid");
      const ctxShapes = doc.shapes.filter(
        (s) => s.metadata?.parentCorner === "context",
      );

      expect(ctxShapes.length).toBeLessThanOrEqual(12);
    });
  });

  describe("metadata text nodes", () => {
    it("emits text-block nodes for backstory fields", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const textNodes = doc.shapes.filter((s) => s.type === "text-block" && s.metadata?.cornerAffinity === "backstory");

      // backStory.text, .author, .publication, .date
      expect(textNodes.length).toBe(4);
    });

    it("emits text-block nodes for authorship fields", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const textNodes = doc.shapes.filter((s) => s.type === "text-block" && s.metadata?.cornerAffinity === "cc");

      // caption, copyright, bio, website, contact, ethics text, ethics flags, location
      expect(textNodes.length).toBeGreaterThanOrEqual(5);
    });

    it("includes voice transcriptions as voice-note shapes", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const voiceNode = doc.shapes.find((s) => s.id.startsWith("voice-"));

      expect(voiceNode).toBeDefined();
      expect(voiceNode!.type).toBe("voice-note");
      expect(voiceNode!.data.transcriptionText).toContain("Voice note text");
    });

    it("includes location and ethics flags in authorship", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const locNode = doc.shapes.find((s) => s.id === "loc-fmt");
      const ethNode = doc.shapes.find((s) => s.id === "eth-flags");

      expect(locNode).toBeDefined();
      expect(locNode!.data.content).toContain("New York");
      expect(ethNode).toBeDefined();
      expect(ethNode!.data.content).toContain("No manipulation");
    });
  });

  describe("connections", () => {
    it("creates connections from center photo to zones", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const photoToZone = doc.connections.filter((c) => c.fromShapeId === "photo-main");

      expect(photoToZone.length).toBe(4);
    });

    it("creates connections from zones to children", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const zoneToChild = doc.connections.filter(
        (c) => c.fromShapeId.startsWith("zone-"),
      );

      // context: 2 + links: 2 + backstory: 4 text + 1 voice + cc: 7+
      expect(zoneToChild.length).toBeGreaterThanOrEqual(10);
    });

    it("every non-center shape is connected", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");
      const connectedIds = new Set<string>();
      for (const c of doc.connections) {
        connectedIds.add(c.fromShapeId);
        connectedIds.add(c.toShapeId);
      }

      for (const shape of doc.shapes) {
        expect(connectedIds.has(shape.id)).toBe(true);
      }
    });
  });

  describe("draggable and resolved colors", () => {
    it("all zones share a consistent locked state, content shapes exist", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid");

      const zones = doc.shapes.filter((s) => s.type === "zone");
      const contentShapes = doc.shapes.filter((s) => s.type !== "zone");

      // All zones must agree on locked state (whatever the transform sets)
      const lockedStates = new Set(zones.map((z) => z.locked));
      expect(lockedStates.size).toBe(1);
      expect(contentShapes.length).toBeGreaterThan(0);
    });

    it("zone colors are resolved hex values, not CSS vars", () => {
      const doc = transformToCanvasDocument(makeProject(), "grid", "dark");
      const zones = doc.shapes.filter((s) => s.type === "zone");

      for (const zone of zones) {
        expect(zone.data.color).toBeDefined();
        expect(zone.data.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe("vertical layout (mobile)", () => {
    it("stacks corners vertically", () => {
      const doc = transformToCanvasDocument(makeProject(), "vertical");
      const zones = doc.shapes.filter((s) => s.type === "zone");

      // All zones at x=0 (mobile stacked)
      zones.forEach((z) => {
        expect(z.x).toBe(0);
      });

      const yValues = zones.map((z) => z.y);
      for (let i = 1; i < yValues.length; i++) {
        expect(yValues[i]).toBeGreaterThan(yValues[i - 1]);
      }
    });
  });

  describe("canvas document structure", () => {
    it("has correct version", () => {
      const doc = transformToCanvasDocument(makeProject());
      expect(doc.version).toBe("1.0");
    });

    it("has canvas dimensions from getLayout()", () => {
      const doc = transformToCanvasDocument(makeProject());
      expect(doc.canvas.width).toBeGreaterThan(0);
      expect(doc.canvas.height).toBeGreaterThan(0);
    });

    it("all shapes have required fields", () => {
      const doc = transformToCanvasDocument(makeProject());
      for (const shape of doc.shapes) {
        expect(shape.id).toBeTruthy();
        expect(shape.type).toBeTruthy();
        expect(typeof shape.x).toBe("number");
        expect(typeof shape.y).toBe("number");
        expect(typeof shape.width).toBe("number");
        expect(typeof shape.height).toBe("number");
        expect(shape.width).toBeGreaterThan(0);
        expect(shape.height).toBeGreaterThan(0);
      }
    });

    it("gridSize is set", () => {
      const doc = transformToCanvasDocument(makeProject());
      expect(doc.canvas.gridSize).toBe(20);
    });

    it("includes zones array matching zone shapes", () => {
      const doc = transformToCanvasDocument(makeProject());
      expect(doc.zones.length).toBe(4);
      doc.zones.forEach((z) => {
        expect(z.bounds.width).toBeGreaterThan(0);
        expect(z.bounds.height).toBeGreaterThan(0);
      });
    });
  });
});
