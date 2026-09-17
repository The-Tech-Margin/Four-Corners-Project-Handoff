/**
 * Shared search core for the floating help launcher and the /docs pages.
 *
 * Framework-free and pure so the matcher and the index are unit-testable
 * without React. `buildDocsIndex` turns the generated docsData into a flat,
 * page-tagged set of jump targets; both surfaces narrow it with `filterByQuery`.
 *
 * @author @thetechmargin
 * @copyright 2026 TheTechMargin
 */
import { docsData } from "@/app/docs/_data/docsData";

export type DocsPage =
  | "/docs"
  | "/docs/creator"
  | "/docs/admin"
  | "/docs/accessibility";

export interface DocsSearchItem {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  page: DocsPage;
  anchor?: string;
}

/**
 * Case-insensitive AND-match: every whitespace-delimited term in `query` must
 * appear somewhere in the text returned by `fields`. An empty query returns the
 * list unchanged.
 */
export function filterByQuery<T>(
  items: T[],
  query: string,
  fields: (item: T) => string[],
): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;
  return items.filter((item) => {
    const haystack = fields(item).join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Flat, page-tagged index of every searchable docs destination. */
export function buildDocsIndex(): DocsSearchItem[] {
  const items: DocsSearchItem[] = [];
  const cornerLabels = docsData.corners.map((c) => c.label).join(", ");
  const cornerKeywords = docsData.corners.flatMap((c) => [c.label, c.subtitle]);

  // Public getting-started page.
  items.push(
    { id: "pub-getting-started", page: "/docs", anchor: "getting-started", title: "Getting started", subtitle: "From request to published", keywords: ["account", "request", "sign in", "invite", "publish"] },
    { id: "pub-four-corners", page: "/docs", anchor: "four-corners", title: "The four corners", subtitle: cornerLabels, keywords: cornerKeywords },
    { id: "pub-gallery", page: "/docs", anchor: "gallery", title: "Browsing the gallery", subtitle: "View and share published work", keywords: ["gallery", "browse", "public", "share", "url"] },
  );

  // Creator (signed-in) comprehensive guide.
  items.push(
    { id: "creator-getting-started", page: "/docs/creator", anchor: "getting-started", title: "Getting started", subtitle: "From request to published", keywords: ["account", "request", "sign in", "publish"] },
    { id: "creator-four-corners", page: "/docs/creator", anchor: "four-corners", title: "The four corners", subtitle: cornerLabels, keywords: cornerKeywords },
    { id: "creator-publishing", page: "/docs/creator", anchor: "publishing", title: "Saving, drafts & publishing", subtitle: "How visibility works", keywords: ["draft", "published", "visibility", "gallery", ...docsData.visibility.map((v) => v.state)] },
    { id: "creator-field-reference", page: "/docs/creator", anchor: "field-reference", title: "Field reference", subtitle: "Every corner's fields", keywords: ["fields", "metadata", "reference"] },
    { id: "creator-api", page: "/docs/creator", anchor: "api", title: "Public API", subtitle: "Read-only gallery API", keywords: ["api", "rest", "json", "endpoint", ...docsData.api.map((a) => a.path)] },
  );

  // Each corner card is its own anchor on the creator page.
  for (const corner of docsData.corners) {
    items.push({
      id: `corner-${corner.key}`,
      page: "/docs/creator",
      anchor: corner.key,
      title: corner.label,
      subtitle: `${corner.position} · ${corner.subtitle}`,
      keywords: [corner.subtitle, corner.position, ...corner.fields.map((f) => f.label)],
    });
  }

  // Cross-cutting data blocks.
  for (const cross of docsData.crossCutting) {
    items.push({
      id: `cross-${cross.key}`,
      page: "/docs/creator",
      anchor: cross.key,
      title: cross.label,
      subtitle: "Cross-cutting data",
      keywords: cross.fields.map((f) => f.label),
    });
  }

  // Accessibility guide (public).
  for (const section of docsData.accessibility) {
    items.push({
      id: `a11y-${section.id}`,
      page: "/docs/accessibility",
      anchor: section.id,
      title: section.title,
      subtitle: "Accessibility",
      keywords: ["accessibility", "keyboard", "screen reader", "a11y"],
    });
  }

  // Admin guide.
  for (const section of docsData.adminGuide) {
    items.push({
      id: `admin-${section.id}`,
      page: "/docs/admin",
      anchor: section.id,
      title: section.title,
      subtitle: section.blurb,
      keywords: ["admin", "back office"],
    });
  }

  return items;
}
