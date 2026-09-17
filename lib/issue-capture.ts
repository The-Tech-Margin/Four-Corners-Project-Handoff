/**
 * Issue intake — client-side context capture.
 *
 * Assembles app_state / device / diagnostics / location at the moment a user
 * files an issue. Everything is best-effort: missing APIs degrade to omitted
 * fields rather than throwing. We never read cookies, tokens, or localStorage
 * auth, and we strip the query string + fragment from the captured URL so
 * secrets in links (e.g. signed URLs, tokens) are never stored.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { useFourCornersStore } from "@/lib/store";
import { getConsoleEntries } from "@/lib/console-buffer";
import { getInteractionEntries } from "@/lib/interaction-buffer";
import { getNetworkEntries } from "@/lib/network-buffer";
import { getVitals } from "@/lib/web-vitals-buffer";

const PERSONA_STORAGE_KEY = "fc-persona";

export interface CapturedContext {
  app_state: Record<string, unknown>;
  device: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  url: string;
  route: string;
  referrer: string;
  user_agent: string;
  captured_at: string;
}

/** Strip query + fragment so secrets in links are never captured. */
function sanitizeHref(): string {
  try {
    const u = new URL(window.location.href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "";
  }
}

function readTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light")
    ? "light"
    : "dark";
}

function readPersona(): string | null {
  try {
    return sessionStorage.getItem(PERSONA_STORAGE_KEY);
  } catch {
    return null;
  }
}

function captureAppState(): Record<string, unknown> {
  // Read the live Zustand state imperatively (no React subscription needed).
  const s = useFourCornersStore.getState();
  return {
    projectId: s.projectId ?? null,
    projectSlug: s.projectSlug ?? null,
    pendingSlug: s.pendingSlug ?? null,
    isUnsaved: Boolean(s.hasUnsavedChanges),
    isSaving: Boolean(s.isSaving),
    lastSavedAt: s.lastSavedAt ?? null,
    layoutMode: s.layoutMode ?? null,
    theme: readTheme(),
    persona: readPersona(),
    // Which corner/section the user was in (tracked by hash-anchor-sync),
    // falling back to the URL hash for the section.
    focusedCorner: s.focusedCorner ?? null,
    focusedSection:
      s.focusedSection ?? (window.location.hash?.replace(/^#/, "") || null),
  };
}

function captureDevice(): Record<string, unknown> {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number };
    deviceMemory?: number;
  };
  const connection = nav.connection;

  const prefersDark =
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? null;
  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? null;

  return {
    userAgent: navigator.userAgent,
    userAgentData:
      // Structured UA when available (Chromium); falls back to raw UA above.
      (navigator as Navigator & { userAgentData?: unknown }).userAgentData ??
      null,
    language: navigator.language,
    languages: navigator.languages,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height },
    devicePixelRatio: window.devicePixelRatio,
    orientation: window.screen.orientation?.type ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    connection: connection
      ? {
          effectiveType: connection.effectiveType ?? null,
          downlink: connection.downlink ?? null,
        }
      : null,
    prefersColorScheme: prefersDark === null ? null : prefersDark ? "dark" : "light",
    prefersReducedMotion,
  };
}

function captureDiagnostics(): Record<string, unknown> {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  };

  let navigationTiming: Record<string, number> | null = null;
  try {
    const [entry] = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    if (entry) {
      navigationTiming = {
        domContentLoaded: Math.round(entry.domContentLoadedEventEnd),
        loadEventEnd: Math.round(entry.loadEventEnd),
        responseEnd: Math.round(entry.responseEnd),
        transferSize: entry.transferSize,
      };
    }
  } catch {
    navigationTiming = null;
  }

  return {
    consoleErrors: getConsoleEntries(),
    // Last user actions (clicks, field identity, navs) and failed requests
    // leading up to the report — see the buffers for redaction rules.
    interactions: getInteractionEntries(),
    network: getNetworkEntries(),
    memory: perf.memory
      ? {
          usedJSHeapSize: perf.memory.usedJSHeapSize,
          totalJSHeapSize: perf.memory.totalJSHeapSize,
          jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
        }
      : null,
    navigationTiming,
    vitals: getVitals(),
  };
}

/** Gather everything (except the screenshot, captured separately). */
export function captureContext(): CapturedContext {
  return {
    app_state: captureAppState(),
    device: captureDevice(),
    diagnostics: captureDiagnostics(),
    url: sanitizeHref(),
    route: typeof window !== "undefined" ? window.location.pathname : "",
    referrer: typeof document !== "undefined" ? document.referrer : "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    captured_at: new Date().toISOString(),
  };
}
