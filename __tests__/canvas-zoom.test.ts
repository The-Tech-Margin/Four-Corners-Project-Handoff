import { describe, it, expect } from "vitest";
import {
  zoomToPoint,
  zoomToCenter,
  ZOOM_MIN,
  ZOOM_MAX,
} from "@/lib/canvas-zoom";

describe("zoomToPoint", () => {
  it("keeps the focal point stationary on screen", () => {
    const camera = { x: 100, y: 50, zoom: 1 };
    const focal = { x: 300, y: 200 };
    const result = zoomToPoint(camera, focal.x, focal.y, 2);

    // The world point under the focal pixel should be the same before and after
    const worldBefore = {
      x: (focal.x - camera.x) / camera.zoom,
      y: (focal.y - camera.y) / camera.zoom,
    };
    const worldAfter = {
      x: (focal.x - result.x) / result.zoom,
      y: (focal.y - result.y) / result.zoom,
    };

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  it("clamps zoom to ZOOM_MIN", () => {
    const result = zoomToPoint({ x: 0, y: 0, zoom: 1 }, 0, 0, 0.01);
    expect(result.zoom).toBe(ZOOM_MIN);
  });

  it("clamps zoom to ZOOM_MAX", () => {
    const result = zoomToPoint({ x: 0, y: 0, zoom: 1 }, 0, 0, 100);
    expect(result.zoom).toBe(ZOOM_MAX);
  });

  it("preserves camera position when zoom does not change", () => {
    const camera = { x: 42, y: 17, zoom: 1.5 };
    const result = zoomToPoint(camera, 200, 200, 1.5);
    expect(result.x).toBeCloseTo(camera.x, 6);
    expect(result.y).toBeCloseTo(camera.y, 6);
  });
});

describe("zoomToCenter", () => {
  it("zooms relative to viewport center", () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const result = zoomToCenter(camera, 800, 600, 2);

    // Viewport center (400, 300) should remain fixed
    const worldBefore = { x: 400 / 1, y: 300 / 1 };
    const worldAfter = {
      x: (400 - result.x) / result.zoom,
      y: (300 - result.y) / result.zoom,
    };

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });
});
