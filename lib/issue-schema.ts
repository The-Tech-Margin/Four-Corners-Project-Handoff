/**
 * Issue intake — shared Zod schema (client form + API route).
 *
 * Only client-supplied fields live here. Identity and build identity are
 * server-derived in the API route and must never be trusted from the client.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { z } from "zod";

export const ISSUE_TYPES = [
  "bug",
  "visual",
  "data",
  "performance",
  "feature",
  "other",
] as const;

/** Reporter-set severity on a 1–5 scale (5 = most severe). */
export const ISSUE_SEVERITY_LEVELS = [1, 2, 3, 4, 5] as const;

export type IssueType = (typeof ISSUE_TYPES)[number];
export type IssueSeverity = (typeof ISSUE_SEVERITY_LEVELS)[number];

/** Human-facing labels for the form controls. */
export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  bug: "Bug",
  visual: "Visual",
  data: "Data",
  performance: "Performance",
  feature: "Feature",
  other: "Other",
};

/** Label + a plain-language example for each severity level (shown in the form). */
export const ISSUE_SEVERITY_INFO: Record<
  number,
  { label: string; example: string }
> = {
  5: {
    label: "Critical",
    example: "The app is unusable or data was lost — e.g. can't save, or the page crashes.",
  },
  4: {
    label: "High",
    example: "A key feature is broken with no workaround.",
  },
  3: {
    label: "Medium",
    example: "Something's broken but there's a workaround.",
  },
  2: {
    label: "Low",
    example: "A minor problem or rough edge with small impact.",
  },
  1: {
    label: "Trivial",
    example: "A cosmetic nitpick — no functional impact.",
  },
};

/**
 * Initial workflow priority (0–3) derived from reporter severity; super-admins
 * can adjust later. Above 3/5 → High (3); exactly 3 → Medium (2); 1–2 → Low (1).
 */
export function priorityFromSeverity(severity: number): number {
  if (severity >= 4) return 3;
  if (severity === 3) return 2;
  return 1;
}

/**
 * A data-URL screenshot, capped well under the column/storage budget.
 * ~1600px WebP q≈0.8 is comfortably under this; the server also re-checks.
 */
const MAX_SCREENSHOT_DATAURL_CHARS = 6_000_000; // ≈4.4 MB decoded

/** Loose JSON object — the capture payload is best-effort and varies by env. */
const jsonObject = z.record(z.string(), z.unknown());

export const IssueReportSchema = z.object({
  type: z.enum(ISSUE_TYPES).default("bug"),
  severity: z.number().int().min(1).max(5).default(3),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().min(1, "Description is required").max(5000),
  steps: z.string().trim().max(5000).optional(),
  extra: z.string().trim().max(2000).optional(),

  // Sanitized location captured client-side (secrets already stripped).
  url: z.string().max(2000).optional(),
  route: z.string().max(500).optional(),
  referrer: z.string().max(2000).optional(),

  // Auto-captured context blobs.
  app_state: jsonObject.default({}),
  device: jsonObject.default({}),
  diagnostics: jsonObject.default({}),

  user_agent: z.string().max(1000).optional(),
  captured_at: z.string().datetime().optional(),

  // Consent toggles from the form.
  consent_screenshot: z.boolean().default(true),
  consent_diagnostics: z.boolean().default(true),

  // Optional one-click DOM snapshot as a WebP data URL.
  screenshot: z
    .string()
    .max(MAX_SCREENSHOT_DATAURL_CHARS)
    .refine((v) => v.startsWith("data:image/"), "Invalid screenshot")
    .optional(),
});

export type IssueReportInput = z.infer<typeof IssueReportSchema>;
