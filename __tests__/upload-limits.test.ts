/**
 * Upload limits — formatting, per-file validation, and plan-quota helpers.
 *
 * Pure unit tests — no mocks needed. The module is deliberately side-effect
 * free; toasts are fired by callers.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  PLAN_QUOTAS,
  USAGE_CRITICAL_RATIO,
  USAGE_WARN_RATIO,
  formatBytes,
  kindFromMime,
  kindLabel,
  resolvePlanLimit,
  validateUpload,
} from "@/lib/upload-limits";

// ─────────────────────────────────────────────────────────────────────────────
// formatBytes
// ─────────────────────────────────────────────────────────────────────────────

describe("formatBytes", () => {
  it("renders bytes below 1 KiB as raw bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("picks the largest unit that keeps the value >= 1", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB"); // 1.5 KB
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1 TB");
  });

  it("drops the trailing .0 for whole-unit values", () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe("2 MB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });

  it("handles non-finite / negative inputs safely", () => {
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(Infinity)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
  });

  it("never runs off the end of the unit table", () => {
    // 2^60 bytes should still render in TB (the largest unit we expose),
    // not throw or index past the array.
    const huge = 1024 ** 5; // 1 PB
    expect(formatBytes(huge)).toMatch(/TB$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAX_UPLOAD_BYTES — table-driven sanity
// ─────────────────────────────────────────────────────────────────────────────

describe("MAX_UPLOAD_BYTES table", () => {
  it("has a limit for every upload kind", () => {
    expect(MAX_UPLOAD_BYTES.image).toBeGreaterThan(0);
    expect(MAX_UPLOAD_BYTES.video).toBeGreaterThan(0);
    expect(MAX_UPLOAD_BYTES.audio).toBeGreaterThan(0);
    expect(MAX_UPLOAD_BYTES.document).toBeGreaterThan(0);
  });

  it("orders the caps as: document < image < audio < video", () => {
    // Not a hard product rule — a guard against accidentally flipping limits.
    expect(MAX_UPLOAD_BYTES.document).toBeLessThan(MAX_UPLOAD_BYTES.image);
    expect(MAX_UPLOAD_BYTES.image).toBeLessThan(MAX_UPLOAD_BYTES.audio);
    expect(MAX_UPLOAD_BYTES.audio).toBeLessThan(MAX_UPLOAD_BYTES.video);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateUpload — pure pass/fail
// ─────────────────────────────────────────────────────────────────────────────

describe("validateUpload", () => {
  const mk = (size: number, name = "test.jpg") => ({ size, name });

  it("passes when size is below the limit", () => {
    const r = validateUpload(mk(1024), "image");
    expect(r.ok).toBe(true);
  });

  it("passes at exactly the limit (inclusive)", () => {
    const r = validateUpload(mk(MAX_UPLOAD_BYTES.image), "image");
    expect(r.ok).toBe(true);
  });

  it("fails one byte over the limit", () => {
    const r = validateUpload(mk(MAX_UPLOAD_BYTES.image + 1), "image");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("image");
      expect(r.limitBytes).toBe(MAX_UPLOAD_BYTES.image);
      expect(r.actualBytes).toBe(MAX_UPLOAD_BYTES.image + 1);
    }
  });

  it("returns a human-readable error with the filename + size", () => {
    const r = validateUpload(
      mk(150 * 1024 * 1024, "interview-raw.mov"),
      "video",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("interview-raw.mov");
      expect(r.error).toContain("150 MB");
      expect(r.error).toContain("100 MB"); // cap
    }
  });

  it("applies the correct cap per kind", () => {
    // 30 MB passes image cap (25) boundary? No — 30 > 25 so it fails image
    // but passes audio (60). Good way to prove the cap is per-kind.
    const thirtyMB = 30 * 1024 * 1024;
    expect(validateUpload(mk(thirtyMB), "image").ok).toBe(false);
    expect(validateUpload(mk(thirtyMB), "audio").ok).toBe(true);
    expect(validateUpload(mk(thirtyMB), "video").ok).toBe(true);
    expect(validateUpload(mk(thirtyMB), "document").ok).toBe(false);
  });

  it("treats 0-byte files as valid (upstream handlers reject separately)", () => {
    const r = validateUpload(mk(0), "image");
    expect(r.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// kindFromMime + kindLabel
// ─────────────────────────────────────────────────────────────────────────────

describe("kindFromMime", () => {
  it("detects image", () => {
    expect(kindFromMime("image/jpeg")).toBe("image");
    expect(kindFromMime("image/heic")).toBe("image");
  });
  it("detects video", () => {
    expect(kindFromMime("video/mp4")).toBe("video");
    expect(kindFromMime("video/quicktime")).toBe("video");
  });
  it("detects audio", () => {
    expect(kindFromMime("audio/webm")).toBe("audio");
    expect(kindFromMime("audio/mpeg")).toBe("audio");
  });
  it("falls through to document for unknown / missing types", () => {
    expect(kindFromMime("application/pdf")).toBe("document");
    expect(kindFromMime("application/msword")).toBe("document");
    expect(kindFromMime("")).toBe("document");
    expect(kindFromMime("weird/custom")).toBe("document");
  });
  it("handles upper-case mime", () => {
    expect(kindFromMime("IMAGE/PNG")).toBe("image");
  });
});

describe("kindLabel", () => {
  it("returns singular nouns suitable for 'X is Y MB — {label}s must…'", () => {
    expect(kindLabel("image")).toBe("image");
    expect(kindLabel("video")).toBe("video");
    expect(kindLabel("audio")).toBe("audio file");
    expect(kindLabel("document")).toBe("document");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLAN_QUOTAS + resolvePlanLimit
// ─────────────────────────────────────────────────────────────────────────────

describe("PLAN_QUOTAS", () => {
  it("orders free < pro < team < unlimited", () => {
    expect(PLAN_QUOTAS.free).toBeLessThan(PLAN_QUOTAS.pro);
    expect(PLAN_QUOTAS.pro).toBeLessThan(PLAN_QUOTAS.team);
    expect(PLAN_QUOTAS.team).toBeLessThan(PLAN_QUOTAS.unlimited);
  });

  it("free tier is at least 100 MB (guard against footguns)", () => {
    expect(PLAN_QUOTAS.free).toBeGreaterThanOrEqual(100 * 1024 * 1024);
  });
});

describe("resolvePlanLimit", () => {
  it("returns the plan's default when no custom limit is set", () => {
    expect(resolvePlanLimit("free", null)).toBe(PLAN_QUOTAS.free);
    expect(resolvePlanLimit("pro", null)).toBe(PLAN_QUOTAS.pro);
    expect(resolvePlanLimit("team", null)).toBe(PLAN_QUOTAS.team);
  });

  it("prefers custom_limit_bytes when > 0", () => {
    const custom = 250 * 1024 * 1024;
    expect(resolvePlanLimit("free", custom)).toBe(custom);
  });

  it("ignores zero / negative custom limits", () => {
    expect(resolvePlanLimit("free", 0)).toBe(PLAN_QUOTAS.free);
    expect(resolvePlanLimit("free", -1)).toBe(PLAN_QUOTAS.free);
  });

  it("falls back to free for unknown plan names", () => {
    expect(resolvePlanLimit("enterprise-gold", null)).toBe(PLAN_QUOTAS.free);
    expect(resolvePlanLimit("", null)).toBe(PLAN_QUOTAS.free);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Threshold constants — sanity check so UI copy aligns with badge colours
// ─────────────────────────────────────────────────────────────────────────────

describe("usage thresholds", () => {
  it("warn threshold is below critical", () => {
    expect(USAGE_WARN_RATIO).toBeLessThan(USAGE_CRITICAL_RATIO);
  });
  it("both are between 0 and 1", () => {
    expect(USAGE_WARN_RATIO).toBeGreaterThan(0);
    expect(USAGE_WARN_RATIO).toBeLessThan(1);
    expect(USAGE_CRITICAL_RATIO).toBeGreaterThan(0);
    expect(USAGE_CRITICAL_RATIO).toBeLessThan(1);
  });
});
