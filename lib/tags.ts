/**
 * Tag system for project classification and gallery filtering.
 *
 * Tags are free-form text[] stored on the projects table.
 * A curated seed list is presented as suggestions in the UI.
 * Internally tags are lowercase-normalized for consistent matching.
 */

// ── Seed tags ────────────────────────────────────────────────────────────────
// Presented as suggestions in the tag editor. Order matters for UI display.

export const SEED_TAGS = [
  "non-fiction photography",
  "documentary",
  "photojournalism",
  "street photography",
  "fine art",
  "portrait",
  "landscape",
  "conceptual",
  "fashion",
  "editorial",
  "sports",
  "wildlife",
  "archival",
  "science & nature",
] as const;

export type SeedTag = (typeof SEED_TAGS)[number];

// ── Display labels ───────────────────────────────────────────────────────────
// Title-cased versions for rendering pills and chips.

const DISPLAY_CACHE = new Map<string, string>();

/** Title-case a tag for display: "non-fiction photography" → "Non-Fiction Photography" */
export function displayTag(tag: string): string {
  const cached = DISPLAY_CACHE.get(tag);
  if (cached) return cached;

  const display = tag
    .split(/(\s+|-)/g)
    .map((seg) =>
      /^[a-z]/.test(seg) ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg,
    )
    .join("");

  DISPLAY_CACHE.set(tag, display);
  return display;
}

// ── Normalization ────────────────────────────────────────────────────────────

/** Normalize a list of tags: lowercase, trim, dedup, remove empties. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }

  return result;
}

// ── Ethics code → tag mapping ────────────────────────────────────────────────
// Maps the customEthicsText prefix to inferred tags.
// Used client-side to auto-suggest tags when a code of ethics is selected.

interface EthicsTagRule {
  /** Prefix or substring to match against customEthicsText */
  match: string;
  /** Tags to infer */
  tags: string[];
}

export const ETHICS_TAG_RULES: EthicsTagRule[] = [
  { match: "As a documentary photographer", tags: ["documentary"] },
  { match: "As a fashion photographer", tags: ["fashion"] },
  { match: "As a fine art photographer", tags: ["fine art"] },
  { match: "This is an artistic image", tags: ["fine art", "journalism"] },
  { match: "As a non-fiction photographer", tags: ["non-fiction photography"] },
  { match: "as a photojournalist", tags: ["photojournalism"] },
  { match: "As a sports photographer", tags: ["sports"] },
  { match: "As a staff member of Associated Press", tags: ["photojournalism", "associated press"] },
  { match: "UNICEF", tags: ["documentary", "unicef"] },
  { match: "As a wildlife photographer", tags: ["wildlife"] },
];

/** Derive tags from a customEthicsText string. */
export function tagsFromEthicsCode(ethicsText: string | undefined | null): string[] {
  if (!ethicsText) return [];

  for (const rule of ETHICS_TAG_RULES) {
    if (ethicsText.includes(rule.match)) {
      return [...rule.tags];
    }
  }

  return [];
}
