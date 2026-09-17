/**
 * Maintenance banner config — a reusable, schema-validated site-wide notice.
 *
 * Single source of truth for the banner shape. Stored as one row in
 * `app_settings` under the key `maintenance_banner` (value = this object as
 * jsonb). Validated on both write (admin route) and read (public route) so the
 * client always receives a well-formed object.
 *
 * Mirrors the field-registry pattern: Zod schema → inferred type → default.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { z } from "zod";

/**
 * Settings keys in `app_settings`. The banner is stored as three rows:
 * content (message/severity/link/window) under MAINTENANCE_BANNER_KEY, and
 * the two booleans as discrete keys following the boolean-flag pattern
 * (`gallery_explore_enabled` et al). The API composes them into one
 * MaintenanceBanner object, so clients never see the split.
 */
export const MAINTENANCE_BANNER_KEY = "maintenance_banner";
export const MAINTENANCE_BANNER_ENABLED_KEY = "maintenance_banner_enabled";
export const MAINTENANCE_BANNER_DISMISSIBLE_KEY =
  "maintenance_banner_dismissible";

export const MaintenanceBannerSchema = z.object({
  /** Master switch — when false the banner never renders. */
  enabled: z.boolean().default(false),
  /** Message shown to visitors. */
  message: z.string().default(""),
  /** Visual severity → drives token styling in the component. */
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  /** When true, visitors can dismiss it (persisted per message in localStorage). */
  dismissible: z.boolean().default(true),
  /** Optional ISO timestamp — banner stays hidden before this time. */
  startsAt: z.string().optional(),
  /** Optional ISO timestamp — banner stays hidden after this time. */
  endsAt: z.string().optional(),
  /** Optional call-to-action link. */
  linkHref: z.string().optional(),
  linkLabel: z.string().optional(),
});

export type MaintenanceBanner = z.infer<typeof MaintenanceBannerSchema>;

/** Stoplight messaging colors per severity — status tokens, not palette accents. */
export const SEVERITY_ACCENT: Record<MaintenanceBanner["severity"], string> = {
  info: "var(--fc-success)",
  warning: "var(--fc-warning)",
  critical: "var(--fc-danger)",
};

/** Disabled-by-default config used for seeding and as a safe fallback. */
export const DEFAULT_BANNER: MaintenanceBanner = MaintenanceBannerSchema.parse({});

/**
 * Common maintenance modes — one-click starting points in the admin editor.
 * Each preset is a full valid config (enabled, ready to save); the admin can
 * tweak the message before saving.
 */
export const BANNER_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  config: MaintenanceBanner;
}> = [
  {
    id: "scheduled-maintenance",
    label: "Scheduled maintenance",
    config: MaintenanceBannerSchema.parse({
      enabled: true,
      severity: "info",
      dismissible: true,
      message:
        "Scheduled maintenance is in progress. You can keep browsing — saving may be briefly unavailable.",
    }),
  },
  {
    id: "key-rotation",
    label: "Security update",
    config: MaintenanceBannerSchema.parse({
      enabled: true,
      severity: "warning",
      dismissible: true,
      message:
        "We're applying a security update. If you're signed in, you may be asked to sign in again.",
    }),
  },
  {
    id: "read-only",
    label: "Read-only mode",
    config: MaintenanceBannerSchema.parse({
      enabled: true,
      severity: "warning",
      dismissible: false,
      message:
        "The site is temporarily read-only while we perform maintenance. Viewing works normally; saving and publishing are paused.",
    }),
  },
  {
    id: "degraded",
    label: "Degraded performance",
    config: MaintenanceBannerSchema.parse({
      enabled: true,
      severity: "warning",
      dismissible: true,
      message:
        "Some features may be slow or intermittently unavailable. We're on it.",
    }),
  },
  {
    id: "incident",
    label: "Major incident",
    config: MaintenanceBannerSchema.parse({
      enabled: true,
      severity: "critical",
      dismissible: false,
      message:
        "We're experiencing a service disruption and are working to restore normal operation.",
    }),
  },
  {
    id: "upcoming",
    label: "Upcoming maintenance",
    config: MaintenanceBannerSchema.parse({
      enabled: true,
      severity: "info",
      dismissible: true,
      message:
        "Heads up: maintenance is scheduled soon. Save your work before it begins.",
    }),
  },
];

/**
 * Coerce an unknown stored value into a valid banner config.
 * Returns DEFAULT_BANNER on any parse failure so callers never crash on a
 * malformed row.
 */
export function parseBanner(value: unknown): MaintenanceBanner {
  const result = MaintenanceBannerSchema.safeParse(value ?? {});
  return result.success ? result.data : DEFAULT_BANNER;
}

/**
 * Compose the three app_settings rows back into one banner config. The
 * discrete boolean rows are authoritative; booleans embedded in the content
 * row (e.g. legacy values) are overridden when the discrete rows exist.
 */
export function composeBanner(
  content: unknown,
  enabled: unknown,
  dismissible: unknown,
): MaintenanceBanner {
  const banner = parseBanner(content);
  return {
    ...banner,
    enabled: typeof enabled === "boolean" ? enabled : banner.enabled,
    dismissible:
      typeof dismissible === "boolean" ? dismissible : banner.dismissible,
  };
}

/**
 * Split a banner config into the three app_settings rows for storage:
 * content (without the booleans) + the two discrete boolean values.
 */
export function splitBanner(banner: MaintenanceBanner): {
  content: Omit<MaintenanceBanner, "enabled" | "dismissible">;
  enabled: boolean;
  dismissible: boolean;
} {
  const { enabled, dismissible, ...content } = banner;
  return { content, enabled, dismissible };
}

/**
 * Whether the banner should be visible right now: enabled, has a message, and
 * within any configured [startsAt, endsAt] window. `now` is injectable for
 * testing; callers in the browser pass Date.now().
 */
export function isBannerActive(banner: MaintenanceBanner, now: number): boolean {
  if (!banner.enabled || !banner.message.trim()) return false;
  if (banner.startsAt) {
    const start = Date.parse(banner.startsAt);
    if (!Number.isNaN(start) && now < start) return false;
  }
  if (banner.endsAt) {
    const end = Date.parse(banner.endsAt);
    if (!Number.isNaN(end) && now > end) return false;
  }
  return true;
}

/**
 * Stable key identifying the *content* of a banner, used to scope localStorage
 * dismissal so editing the message re-shows the banner to everyone.
 */
export function bannerDismissKey(banner: MaintenanceBanner): string {
  // Cheap, dependency-free hash of the user-visible fields.
  const basis = `${banner.severity}|${banner.message}|${banner.linkHref ?? ""}`;
  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash << 5) - hash + basis.charCodeAt(i);
    hash |= 0;
  }
  return `fc-maint-banner-dismissed:${hash}`;
}
