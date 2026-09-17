/**
 * Maintenance banner — site-wide, schema-driven notice configured by a
 * super-admin (see lib/maintenance-banner.ts + /api/settings/maintenance_banner).
 *
 * Renders nothing in the common (disabled) case. When active it fixes a
 * translucent bar directly BELOW the global header (never obstructing it) and
 * publishes its height as the `--fc-banner-h` CSS variable so page content
 * shifts down by exactly that amount. When inactive the variable stays 0, so
 * the layout is pixel-identical to a site with no banner.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Info, TriangleAlert, OctagonAlert, X } from "lucide-react";
import {
  MAINTENANCE_BANNER_KEY,
  SEVERITY_ACCENT,
  parseBanner,
  isBannerActive,
  bannerDismissKey,
  type MaintenanceBanner,
} from "@/lib/maintenance-banner";

/** Color-coded severity icon — shared by the live banner and the admin list. */
export function SeverityIcon({
  severity,
  className = "w-4 h-4 flex-shrink-0",
}: {
  severity: MaintenanceBanner["severity"];
  className?: string;
}) {
  const Icon =
    severity === "critical"
      ? OctagonAlert
      : severity === "warning"
        ? TriangleAlert
        : Info;
  return (
    <Icon
      className={className}
      style={{ color: SEVERITY_ACCENT[severity] }}
      aria-hidden="true"
    />
  );
}

function setBannerHeightVar(px: number) {
  if (typeof document === "undefined") return;
  // Set on <body>, NOT documentElement: the persona palette system clears the
  // root's entire inline style on theme resets (lib/palette.ts), which would
  // wipe this var. The header and content read it via inheritance from body.
  document.body.style.setProperty("--fc-banner-h", `${px}px`);
}

export function MaintenanceBanner() {
  // Loaded config plus its activity + dismissal state, all evaluated at load
  // time (render stays pure — no clock reads or storage reads during render).
  const [state, setState] = useState<{
    banner: MaintenanceBanner;
    active: boolean;
    dismissed: boolean;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Load config once on mount. Disabled config → renders nothing, no layout cost.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/${MAINTENANCE_BANNER_KEY}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const banner = parseBanner(data.value);
        const active = isBannerActive(banner, Date.now());
        let dismissed = false;
        if (active && banner.dismissible) {
          try {
            dismissed = localStorage.getItem(bannerDismissKey(banner)) === "1";
          } catch {
            /* storage unavailable — treat as not dismissed */
          }
        }
        setState({ banner, active, dismissed });
      })
      .catch(() => {
        /* banner is non-critical — ignore fetch failures */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const banner = state?.banner ?? null;
  const visible = !!state && state.active && !state.dismissed;

  // Publish the rendered height so the header/content offset matches exactly.
  // Clear it to 0 whenever the banner isn't visible.
  useEffect(() => {
    if (!visible) {
      setBannerHeightVar(0);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const update = () => setBannerHeightVar(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setBannerHeightVar(0);
    };
  }, [visible]);

  if (!banner || !visible) return null;

  const accent = SEVERITY_ACCENT[banner.severity];

  const handleDismiss = () => {
    try {
      localStorage.setItem(bannerDismissKey(banner), "1");
    } catch {
      /* ignore storage failures */
    }
    setState((prev) => (prev ? { ...prev, dismissed: true } : prev));
  };

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className="fixed top-14 sm:top-16 left-0 right-0 z-40 border-b backdrop-blur-md"
      style={{
        // Translucent so content scrolling beneath stays visible; sits BELOW
        // the fixed header (top = header height, z under the header's z-50).
        background: "color-mix(in srgb, var(--fc-surface) 72%, transparent)",
        borderBottomColor: "var(--fc-header-border)",
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <SeverityIcon severity={banner.severity} />
            {/* inline margin: 0 — an un-layered global `p { margin-bottom }`
                rule outranks utility classes and would inflate the flex
                margin-box, pushing the text off the icon's midline */}
            <p
              className="text-sm leading-snug"
              style={{ color: "var(--fc-text)", margin: 0 }}
            >
              {banner.message}
              {banner.linkHref && banner.linkLabel && (
                <>
                  {" "}
                  <a
                    href={banner.linkHref}
                    className="underline font-medium"
                    style={{ color: accent }}
                  >
                    {banner.linkLabel}
                  </a>
                </>
              )}
            </p>
          </div>
          {banner.dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss notice"
              className="flex-shrink-0 p-1 rounded transition-opacity hover:opacity-70"
              style={{ color: "var(--fc-text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
