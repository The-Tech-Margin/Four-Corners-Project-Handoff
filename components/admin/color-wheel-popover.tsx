/**
 * Color wheel popover — HSL picker with harmony schemes.
 *
 * Pure canvas (no deps). Renders a hue ring + lightness slider + hex input,
 * plus complementary/triad/tetrad suggestion swatches.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  harmony,
  hexToHsl,
  hslToHex,
  isValidHex,
  type HarmonyScheme,
} from "@/lib/color-utils";

interface Props {
  value: string;
  onChange: (hex: string) => void;
  /** Called when user clicks "Apply" on a harmony scheme. */
  onApplyScheme?: (colors: string[], scheme: HarmonyScheme) => void;
  onClose: () => void;
  /** Anchor element bounding rect — popover positions relative to it. */
  anchorRect: DOMRect | null;
}

const WHEEL_SIZE = 180;
const WHEEL_RADIUS = WHEEL_SIZE / 2 - 6;

function drawWheel(canvas: HTMLCanvasElement, lightness: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cx = WHEEL_SIZE / 2;
  const cy = WHEEL_SIZE / 2;
  const radius = WHEEL_RADIUS;
  ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);

  // Draw hue ring as pixel-by-pixel gradient
  const imageData = ctx.createImageData(WHEEL_SIZE, WHEEL_SIZE);
  const data = imageData.data;
  for (let y = 0; y < WHEEL_SIZE; y++) {
    for (let x = 0; x < WHEEL_SIZE; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * WHEEL_SIZE + x) * 4;
      if (dist > radius) {
        data[idx + 3] = 0;
        continue;
      }
      const hue = (Math.atan2(dy, dx) * 180) / Math.PI;
      const saturation = Math.min(1, dist / radius);
      const { r, g, b } = hslToRgbLocal(hue, saturation, lightness);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// Inline HSL→RGB to avoid calling the shared util from a tight pixel loop
function hslToRgbLocal(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const hn = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hn < 60) {
    r1 = c;
    g1 = x;
  } else if (hn < 120) {
    r1 = x;
    g1 = c;
  } else if (hn < 180) {
    g1 = c;
    b1 = x;
  } else if (hn < 240) {
    g1 = x;
    b1 = c;
  } else if (hn < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function ColorWheelPopover({
  value,
  onChange,
  onApplyScheme,
  onClose,
  anchorRect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [hexInput, setHexInput] = useState(value);
  const [scheme, setScheme] = useState<HarmonyScheme | null>(null);

  const hsl = hexToHsl(value) ?? { h: 0, s: 0, l: 0.5 };

  // Redraw wheel when lightness changes
  useEffect(() => {
    if (canvasRef.current) drawWheel(canvasRef.current, hsl.l);
  }, [hsl.l]);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  // Close on Escape + outside click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const handleWheelPointer = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - WHEEL_SIZE / 2;
      const y = e.clientY - rect.top - WHEEL_SIZE / 2;
      const dist = Math.sqrt(x * x + y * y);
      if (dist > WHEEL_RADIUS) return;
      const hue = (Math.atan2(y, x) * 180) / Math.PI;
      const saturation = Math.min(1, dist / WHEEL_RADIUS);
      const hex = hslToHex({ h: hue, s: saturation, l: hsl.l });
      onChange(hex);
    },
    [hsl.l, onChange],
  );

  const handleLightnessChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newL = Number(e.target.value) / 100;
      onChange(hslToHex({ ...hsl, l: newL }));
    },
    [hsl, onChange],
  );

  const handleHexInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setHexInput(val);
      if (isValidHex(val)) {
        onChange(val.startsWith("#") ? val : `#${val}`);
      }
    },
    [onChange],
  );

  // Compute indicator position on the wheel
  const angleRad = (hsl.h * Math.PI) / 180;
  const distFromCenter = hsl.s * WHEEL_RADIUS;
  const indicatorX = WHEEL_SIZE / 2 + Math.cos(angleRad) * distFromCenter;
  const indicatorY = WHEEL_SIZE / 2 + Math.sin(angleRad) * distFromCenter;

  const harmonyColors = scheme ? harmony(value, scheme) : [];

  // Position popover near anchor
  const style: React.CSSProperties = {
    position: "fixed",
    top: anchorRect ? anchorRect.bottom + 8 : 100,
    left: anchorRect
      ? Math.max(
          8,
          Math.min(
            window.innerWidth - 280,
            anchorRect.left + anchorRect.width / 2 - 140,
          ),
        )
      : 100,
    zIndex: 100,
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Color picker"
      className="rounded-lg shadow-xl p-3 w-[260px]"
      style={{
        ...style,
        background: "var(--fc-surface)",
        border: "1px solid var(--fc-border)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Wheel with indicator */}
      <div
        className="relative mx-auto"
        style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
      >
        <canvas
          ref={canvasRef}
          width={WHEEL_SIZE}
          height={WHEEL_SIZE}
          onPointerDown={handleWheelPointer}
          onPointerMove={(e) => {
            if (e.buttons === 1) handleWheelPointer(e);
          }}
          className="cursor-crosshair rounded-full"
        />
        <div
          className="absolute w-3 h-3 rounded-full pointer-events-none"
          style={{
            left: indicatorX - 6,
            top: indicatorY - 6,
            border: "2px solid white",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      </div>

      {/* Lightness slider */}
      <div className="mt-3">
        <label
          className="block text-[10px] uppercase tracking-wider mb-1"
          style={{ color: "var(--fc-text-muted)" }}
        >
          Lightness
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(hsl.l * 100)}
          onChange={handleLightnessChange}
          className="w-full accent-[var(--fc-accent)]"
        />
      </div>

      {/* Hex input + preview swatch */}
      <div className="flex items-center gap-2 mt-2">
        <span
          className="w-6 h-6 rounded shrink-0"
          style={{
            background: value,
            border: "1px solid var(--fc-border)",
          }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={handleHexInput}
          className="flex-1 px-2 py-1 rounded text-xs font-mono outline-none"
          style={{
            background: "var(--fc-bg)",
            color: "var(--fc-text)",
            border: "1px solid var(--fc-border)",
          }}
        />
      </div>

      {/* Harmony schemes */}
      <div className="mt-3">
        <div className="flex gap-1 mb-1.5">
          {(
            [
              { id: "complementary", label: "Comp" },
              { id: "triad", label: "Triad" },
              { id: "tetrad", label: "Tetrad" },
              { id: "analogous", label: "Analog" },
            ] as { id: HarmonyScheme; label: string }[]
          ).map((s) => {
            const isActive = scheme === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setScheme(isActive ? null : s.id)}
                className="flex-1 px-1.5 py-1 rounded text-[10px] font-medium"
                style={{
                  background: isActive ? "var(--fc-accent)" : "var(--fc-wash)",
                  color: isActive ? "var(--fc-accent-on)" : "var(--fc-text)",
                  border: "1px solid var(--fc-border)",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {harmonyColors.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {harmonyColors.map((c, i) => (
                <button
                  key={`${c}-${i}`}
                  type="button"
                  onClick={() => onChange(c)}
                  className="flex-1 h-6 rounded"
                  style={{
                    background: c,
                    border: "1px solid var(--fc-border)",
                  }}
                  title={`Use ${c}`}
                />
              ))}
            </div>
            {onApplyScheme && (
              <button
                type="button"
                onClick={() => scheme && onApplyScheme(harmonyColors, scheme)}
                className="w-full px-2 py-1 rounded text-[10px] font-semibold"
                style={{
                  background: "var(--fc-accent)",
                  color: "var(--fc-accent-on)",
                }}
              >
                Apply scheme
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
