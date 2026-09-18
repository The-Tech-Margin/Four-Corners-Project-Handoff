/**
 * Shared help-search core tests — the matcher and the docs index that both the
 * floating launcher and the /docs search depend on.
 */
import { describe, it, expect } from "vitest";
import { filterByQuery, buildDocsIndex } from "@/lib/help-search";

interface Row {
  title: string;
  subtitle: string;
  keywords: string[];
}

function fixture(overrides: Partial<Row> = {}): Row {
  return {
    title: "Field reference",
    subtitle: "Every corner's fields",
    keywords: ["metadata", "fields"],
    ...overrides,
  };
}

const fields = (r: Row) => [r.title, r.subtitle, ...r.keywords];

describe("filterByQuery", () => {
  it("returns all items for an empty or whitespace query", () => {
    const rows = [fixture(), fixture({ title: "Public API" })];
    expect(filterByQuery(rows, "", fields)).toHaveLength(2);
    expect(filterByQuery(rows, "   ", fields)).toHaveLength(2);
  });

  it("matches case-insensitively across title, subtitle, and keywords", () => {
    const rows = [
      fixture({ title: "Public API", subtitle: "Read-only gallery API", keywords: ["json"] }),
      fixture(),
    ];
    expect(filterByQuery(rows, "JSON", fields)).toHaveLength(1);
    expect(filterByQuery(rows, "gallery", fields)[0].title).toBe("Public API");
    expect(filterByQuery(rows, "METADATA", fields)[0].title).toBe("Field reference");
  });

  it("requires every whitespace-delimited term to match (AND semantics)", () => {
    const rows = [
      fixture({ title: "Saving, drafts & publishing", keywords: ["visibility"] }),
      fixture({ title: "Field reference", keywords: ["metadata"] }),
    ];
    expect(filterByQuery(rows, "drafts publishing", fields)).toHaveLength(1);
    expect(filterByQuery(rows, "drafts metadata", fields)).toHaveLength(0);
  });
});

describe("buildDocsIndex", () => {
  const index = buildDocsIndex();

  it("tags every item with a known page and a stable id", () => {
    const pages = new Set(["/docs", "/docs/creator", "/docs/accessibility"]);
    expect(index.length).toBeGreaterThan(0);
    for (const item of index) {
      expect(pages.has(item.page)).toBe(true);
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
    }
    // ids are unique
    expect(new Set(index.map((i) => i.id)).size).toBe(index.length);
  });

  it("indexes each corner as its own creator-page anchor", () => {
    const corner = index.find((i) => i.id === "corner-context");
    expect(corner).toBeDefined();
    expect(corner?.page).toBe("/docs/creator");
    expect(corner?.anchor).toBe("context");
  });

  it("includes publishing, api and accessibility destinations", () => {
    const byId = (id: string) => index.find((i) => i.id === id);
    expect(byId("creator-publishing")?.anchor).toBe("publishing");
    expect(byId("creator-api")?.anchor).toBe("api");
    expect(index.some((i) => i.page === "/docs/accessibility")).toBe(true);
  });

  it("surfaces the same section on both the public and creator pages", () => {
    const pub = index.find((i) => i.id === "pub-getting-started");
    const creator = index.find((i) => i.id === "creator-getting-started");
    expect(pub?.page).toBe("/docs");
    expect(creator?.page).toBe("/docs/creator");
    expect(pub?.anchor).toBe("getting-started");
    expect(creator?.anchor).toBe("getting-started");
  });
});
