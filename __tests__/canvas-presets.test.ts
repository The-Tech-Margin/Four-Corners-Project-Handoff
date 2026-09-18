/**
 * Tests for sketchboard canvas presets.
 * Verifies preset shape definitions are well-formed.
 */

import { describe, it, expect } from "vitest";
import { CANVAS_PRESETS, getPreset } from "@/components/sketchboard/presets";

describe("CANVAS_PRESETS", () => {
  it("has 4 presets", () => {
    expect(CANVAS_PRESETS).toHaveLength(4);
  });

  it("each preset has required fields", () => {
    for (const preset of CANVAS_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.zoom).toBeGreaterThan(0);
      expect(preset.zoom).toBeLessThanOrEqual(1);
      expect(Array.isArray(preset.shapes)).toBe(true);
    }
  });

  it("quick preset has caption + byline + voice shapes", () => {
    const quick = getPreset("quick");
    expect(quick.id).toBe("quick");
    expect(quick.shapes.length).toBe(3);

    const types = quick.shapes.map((s) => s.type);
    expect(types).toContain("text-block");
    expect(types).toContain("voice-note");
  });

  it("voice-first preset starts with voice note", () => {
    const voiceFirst = getPreset("voice-first");
    expect(voiceFirst.shapes[0].type).toBe("voice-note");
  });

  it("full preset has the most shapes", () => {
    const full = getPreset("full");
    expect(full.shapes.length).toBeGreaterThanOrEqual(8);
  });

  it("narrative preset includes large backstory text block", () => {
    const narrative = getPreset("narrative");
    const backstory = narrative.shapes.find(
      (s) => s.props.fieldMapping === "backStory.text" && s.type === "text-block",
    );
    expect(backstory).toBeDefined();
    expect(backstory!.props.w).toBeGreaterThanOrEqual(400);
  });

  it("all shape positions are non-negative", () => {
    for (const preset of CANVAS_PRESETS) {
      for (const shape of preset.shapes) {
        expect(shape.x).toBeGreaterThanOrEqual(0);
        expect(shape.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("all shapes have valid types", () => {
    const validTypes = ["text-block", "voice-note", "context-item", "link-card"];
    for (const preset of CANVAS_PRESETS) {
      for (const shape of preset.shapes) {
        expect(validTypes).toContain(shape.type);
      }
    }
  });

  it("shape dimensions are specified as w/h props", () => {
    for (const preset of CANVAS_PRESETS) {
      for (const shape of preset.shapes) {
        expect(typeof shape.props.w).toBe("number");
        expect(typeof shape.props.h).toBe("number");
        expect(shape.props.w).toBeGreaterThan(0);
        expect(shape.props.h).toBeGreaterThan(0);
      }
    }
  });
});

describe("getPreset", () => {
  it("returns the requested preset", () => {
    expect(getPreset("quick").id).toBe("quick");
    expect(getPreset("voice-first").id).toBe("voice-first");
    expect(getPreset("full").id).toBe("full");
    expect(getPreset("narrative").id).toBe("narrative");
  });

  it("returns quick as fallback for unknown id", () => {
    expect(getPreset("unknown").id).toBe("quick");
  });
});
