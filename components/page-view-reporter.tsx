/**
 * PageViewReporter — fires a lightweight pageview ingest POST on every
 * client navigation. Uses sendBeacon where available, falls back to
 * fetch({ keepalive: true }). Session ID is stored in sessionStorage so
 * it's scoped per-tab, per-browser, and is wiped on tab close.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SESSION_KEY = "fc_analytics_session";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function sendPageView(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/analytics/pageview", blob);
      if (ok) return;
    }
    void fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Swallow — analytics must never break navigation
  }
}

export function PageViewReporter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastReportedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    // Dedupe: only fire when the pathname actually changes
    if (lastReportedRef.current === pathname) return;
    lastReportedRef.current = pathname;

    const sessionId = getOrCreateSessionId();
    const referrer =
      typeof document !== "undefined" ? document.referrer || null : null;

    sendPageView({
      path: pathname,
      route: pathname,
      referrer,
      sessionId,
      utm_source: searchParams?.get("utm_source") ?? null,
      utm_medium: searchParams?.get("utm_medium") ?? null,
      utm_campaign: searchParams?.get("utm_campaign") ?? null,
    });
  }, [pathname, searchParams]);

  return null;
}
