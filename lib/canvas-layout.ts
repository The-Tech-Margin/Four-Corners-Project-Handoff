/**
 * Canvas layout constants and getLayout() — shared by both
 * the sketchboard editor (use-canvas-bridge) and the explore view (transform).
 *
 * Extracted to avoid pulling in Konva / @fourcorners/canvas at import time,
 * which matters for tests and SSR contexts.
 */

// Zone layout constants
export const ZW = 500;
export const ZH = 400;
export const GAP = 40;

export interface CanvasLayout {
  zw: number;
  zh: number;
  gap: number;
  positions: {
    context: { x: number; y: number };
    links: { x: number; y: number };
    backstory: { x: number; y: number };
    cc: { x: number; y: number };
  };
  photoX: number;
  photoY: number;
  totalW: number;
  totalH: number;
}

/** Desktop: 2x2 grid. Mobile: vertical stack filling viewport width. */
export function getLayout(viewportWidth?: number): CanvasLayout {
  const mobile = viewportWidth !== undefined && viewportWidth < 640;

  if (mobile) {
    const mw = Math.max(viewportWidth - 32, 300);
    const mh = 260;
    const mg = 20;

    // Photo card sits above the zones, then zones stack below
    const photoH = 225; // 300 * 0.75
    const photoAreaH = photoH + mg;

    const positions = {
      context:   { x: 0, y: photoAreaH },
      links:     { x: 0, y: photoAreaH + mh + mg },
      backstory: { x: 0, y: photoAreaH + (mh + mg) * 2 },
      cc:        { x: 0, y: photoAreaH + (mh + mg) * 3 },
    };

    const totalH = photoAreaH + (mh + mg) * 4 - mg;
    const photoW = Math.min(300, mw * 0.8);
    const photoX = (mw - photoW) / 2;
    const photoY = 0;

    return { zw: mw, zh: mh, gap: mg, positions, photoX, photoY, totalW: mw, totalH };
  }

  // Desktop: 2x2 grid
  const positions = {
    context:   { x: 0,          y: 0 },
    links:     { x: ZW + GAP,   y: 0 },
    backstory: { x: 0,          y: ZH + GAP },
    cc:        { x: ZW + GAP,   y: ZH + GAP },
  };

  const totalW = ZW * 2 + GAP;
  const totalH = ZH * 2 + GAP;
  const photoX = totalW / 2 - 200;
  const photoY = totalH / 2 - 150;

  return { zw: ZW, zh: ZH, gap: GAP, positions, photoX, photoY, totalW, totalH };
}
