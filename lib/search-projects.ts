/**
 * Unified project search — driven by field-registry.
 *
 * Builds a single lowercase search string per project from every field
 * marked `includeInListing` in the registry, plus array fields (context
 * captions/descriptions/credits, link titles/sources, voice transcription text).
 *
 * The index is computed once per project list (O(n)) and searched on every
 * keystroke (O(1) per project via string.includes).
 */

import { getValueByPath } from "@/lib/field-utils";
import type { ProjectRecord } from "@/lib/db/projects";
import type { FourCornersMetadataExtended } from "@/lib/schema";

// ── Index builder ───────────────────────────────────────────────────────────

/** Key metadata paths for search indexing */
const LISTING_PATHS = [
  "backStory.text",
  "backStory.author",
  "backStory.publication",
  "backStory.date",
  "creativeCommons.copyright",
  "creativeCommons.description",
  "photographerInfo.bio",
  "photographerInfo.contact",
  "photographerInfo.website",
  "location.city",
  "location.state",
  "location.country",
  "location.formattedLocation",
  "photoMetadata.equipment.cameraMake",
  "photoMetadata.equipment.cameraModel",
  "photoMetadata.equipment.lensModel",
];

/**
 * Build a search index: Map<projectId, lowercased concatenated text>.
 * Call once when the project list changes, pass result to `searchProjects`.
 */
export function buildSearchIndex(
  projects: ProjectRecord[],
): Map<string, string> {
  const index = new Map<string, string>();

  for (const project of projects) {
    const m = project.metadata ?? ({} as FourCornersMetadataExtended);
    const parts: string[] = [];

    // 1. Top-level project columns (not in metadata)
    if (project.title) parts.push(project.title);
    if (project.author) parts.push(project.author);
    if (project.slug) parts.push(project.slug);

    // 2. All registry fields flagged as listing fields
    for (const path of LISTING_PATHS) {
      const val = getValueByPath(m, path);
      if (val != null && val !== "") {
        parts.push(String(val));
      }
    }

    // 3. Array fields — context items
    if (m.context && Array.isArray(m.context)) {
      for (const c of m.context) {
        if (c.caption) parts.push(c.caption);
        if (c.description) parts.push(c.description);
        if (c.credit) parts.push(c.credit);
        if (c.filename) parts.push(c.filename);
        if (c.date) parts.push(c.date);
      }
    }

    // 4. Array fields — links
    if (m.links && Array.isArray(m.links)) {
      for (const l of m.links) {
        if (l.title) parts.push(l.title);
        if (l.source) parts.push(l.source);
        if (l.url) parts.push(l.url);
      }
    }

    // 5. Array fields — voice transcriptions
    if (m.voiceTranscriptions && Array.isArray(m.voiceTranscriptions)) {
      for (const vt of m.voiceTranscriptions) {
        if (vt.text) parts.push(vt.text);
      }
    }

    // 6. Ethics text (nested under ethics.*)
    if (m.ethics) {
      if (m.ethics.customEthicsText) parts.push(m.ethics.customEthicsText);
      if (m.ethics.manipulationDetails) parts.push(m.ethics.manipulationDetails);
      if (m.ethics.stagingDetails) parts.push(m.ethics.stagingDetails);
      if (m.ethics.consentDetails) parts.push(m.ethics.consentDetails);
      if (m.ethics.identityProtectionDetails) parts.push(m.ethics.identityProtectionDetails);
      if (m.ethics.aiAlteredDetails) parts.push(m.ethics.aiAlteredDetails);
    }

    // 7. Tags
    if (project.tags && Array.isArray(project.tags)) {
      for (const tag of project.tags) {
        if (tag) parts.push(tag);
      }
    }

    // 8. Location address fields
    if (m.location?.address) {
      const a = m.location.address;
      if (a.street) parts.push(a.street);
      if (a.city) parts.push(a.city);
      if (a.stateProvince) parts.push(a.stateProvince);
      if (a.country) parts.push(a.country);
      if (a.postalCode) parts.push(a.postalCode);
    }

    index.set(project.id, parts.join(" ").toLowerCase());
  }

  return index;
}

// ── Search function ─────────────────────────────────────────────────────────

/**
 * Filter projects by a search query using a pre-built index.
 * Supports multi-word queries: each word must appear somewhere in the
 * indexed text (AND logic). Single words use fast substring matching.
 */
export function searchProjects(
  projects: ProjectRecord[],
  query: string,
  index: Map<string, string>,
): ProjectRecord[] {
  const trimmed = query.trim();
  if (!trimmed) return projects;

  const words = trimmed.toLowerCase().split(/\s+/);

  return projects.filter((project) => {
    const text = index.get(project.id);
    if (!text) return false;
    // Every word must appear somewhere in the concatenated index text
    return words.every((word) => text.includes(word));
  });
}
