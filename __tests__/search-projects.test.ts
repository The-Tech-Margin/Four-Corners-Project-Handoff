import { describe, it, expect } from "vitest";
import { buildSearchIndex, searchProjects } from "@/lib/search-projects";
import type { ProjectRecord } from "@/lib/projects/types";

/** Minimal project stub for testing */
function makeProject(
  id: string,
  overrides: Partial<ProjectRecord> = {},
): ProjectRecord {
  return {
    id,
    user_id: "u1",
    metadata: {
      backStory: { text: "", author: "", publication: "", publicationUrl: "", date: "" },
      context: [],
      links: [],
      creativeCommons: { copyright: "", description: "" },
    },
    published: false,
    in_gallery: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as ProjectRecord;
}

describe("buildSearchIndex", () => {
  it("indexes top-level project columns", () => {
    const projects = [makeProject("p1", { title: "Sunrise", author: "Jane Doe", slug: "sunrise-shot" })];
    const index = buildSearchIndex(projects);

    expect(index.get("p1")).toContain("sunrise");
    expect(index.get("p1")).toContain("jane doe");
    expect(index.get("p1")).toContain("sunrise-shot");
  });

  it("indexes nested metadata fields", () => {
    const projects = [
      makeProject("p1", {
        metadata: {
          backStory: { text: "A story about drought", author: "Reporter", publication: "Times", publicationUrl: "", date: "2025" },
          context: [],
          links: [],
          creativeCommons: { copyright: "CC-BY", description: "Free to use" },
        },
      } as unknown as Parameters<typeof makeProject>[1]),
    ];
    const index = buildSearchIndex(projects);
    const text = index.get("p1")!;

    expect(text).toContain("drought");
    expect(text).toContain("reporter");
    expect(text).toContain("times");
    expect(text).toContain("cc-by");
    expect(text).toContain("free to use");
  });

  it("indexes context item captions and descriptions", () => {
    const projects = [
      makeProject("p1", {
        metadata: {
          backStory: { text: "", author: "", publication: "", publicationUrl: "", date: "" },
          context: [
            { id: "c1", caption: "Workers in the field", description: "Agricultural scene", credit: "AP", filename: "workers.jpg", date: "2024-06" },
          ],
          links: [],
          creativeCommons: { copyright: "", description: "" },
        },
      } as unknown as Parameters<typeof makeProject>[1]),
    ];
    const index = buildSearchIndex(projects);
    const text = index.get("p1")!;

    expect(text).toContain("workers in the field");
    expect(text).toContain("agricultural scene");
    expect(text).toContain("ap");
    expect(text).toContain("workers.jpg");
  });

  it("indexes link titles and sources", () => {
    const projects = [
      makeProject("p1", {
        metadata: {
          backStory: { text: "", author: "", publication: "", publicationUrl: "", date: "" },
          context: [],
          links: [{ title: "Source Article", url: "https://example.com", source: "Reuters" }],
          creativeCommons: { copyright: "", description: "" },
        },
      } as unknown as Parameters<typeof makeProject>[1]),
    ];
    const index = buildSearchIndex(projects);
    const text = index.get("p1")!;

    expect(text).toContain("source article");
    expect(text).toContain("reuters");
  });

  it("indexes ethics text fields", () => {
    const projects = [
      makeProject("p1", {
        metadata: {
          backStory: { text: "", author: "", publication: "", publicationUrl: "", date: "" },
          context: [],
          links: [],
          creativeCommons: { copyright: "", description: "" },
          ethics: {
            customEthicsText: "Verified by editor",
            noManipulation: true,
            noStaging: true,
            informedConsent: true,
            identityProtected: false,
          },
        },
      } as unknown as Parameters<typeof makeProject>[1]),
    ];
    const index = buildSearchIndex(projects);

    expect(index.get("p1")).toContain("verified by editor");
  });
});

describe("searchProjects", () => {
  const projects = [
    makeProject("p1", { title: "Sunrise over Colorado", author: "Jane Doe" }),
    makeProject("p2", { title: "Street Photography Tokyo", author: "Ken Tanaka" }),
    makeProject("p3", { title: "Wildlife in Colorado", author: "Bob Smith" }),
  ];
  const index = buildSearchIndex(projects);

  it("returns all projects for empty query", () => {
    expect(searchProjects(projects, "", index)).toHaveLength(3);
    expect(searchProjects(projects, "   ", index)).toHaveLength(3);
  });

  it("filters by single word (case-insensitive)", () => {
    const results = searchProjects(projects, "Colorado", index);
    expect(results).toHaveLength(2);
    expect(results.map((p) => p.id)).toEqual(["p1", "p3"]);
  });

  it("supports multi-word AND queries", () => {
    const results = searchProjects(projects, "colorado jane", index);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("p1");
  });

  it("multi-word query with no match returns empty", () => {
    const results = searchProjects(projects, "colorado tokyo", index);
    expect(results).toHaveLength(0);
  });

  it("matches substring within words", () => {
    const results = searchProjects(projects, "wild", index);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("p3");
  });

  it("is case-insensitive", () => {
    const results = searchProjects(projects, "TOKYO", index);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("p2");
  });
});
