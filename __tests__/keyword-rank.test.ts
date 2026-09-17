import { describe, it, expect } from "vitest";
import { rankProjectsByKeywords, scoreProject } from "@/lib/search/keyword-rank";
import type { ProjectDocument } from "@/lib/projects/types";
import { createEmptyMetadata } from "@/lib/schema";

function project(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: "p1",
    ownerId: "u1",
    slug: null,
    title: null,
    metadata: createEmptyMetadata(),
    mainImage: null,
    published: true,
    inGallery: true,
    tags: [],
    lineage: { parentProjectId: null, versionNumber: 1, forkedFromUserId: null, isFork: false },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function withBackstory(text: string, overrides: Partial<ProjectDocument> = {}) {
  const metadata = createEmptyMetadata();
  metadata.backStory = { ...metadata.backStory, text };
  return project({ metadata, ...overrides });
}

describe("scoreProject", () => {
  it("weights the title above the backstory", () => {
    const titled = project({ id: "a", title: "Drought" });
    const narrated = withBackstory("A story about drought", { id: "b" });
    expect(scoreProject(titled, "drought")).toBeGreaterThan(scoreProject(narrated, "drought"));
  });

  it("requires every word to appear somewhere", () => {
    const doc = withBackstory("A story about drought");
    expect(scoreProject(doc, "story drought")).toBeGreaterThan(0);
    expect(scoreProject(doc, "story flood")).toBe(0);
  });

  it("ignores case and scores an empty query as no match", () => {
    const doc = project({ title: "Harbour Morning" });
    expect(scoreProject(doc, "HARBOUR")).toBeGreaterThan(0);
    expect(scoreProject(doc, "   ")).toBe(0);
  });

  it("matches tags", () => {
    expect(scoreProject(project({ tags: ["climate"] }), "climate")).toBeGreaterThan(0);
  });
});

describe("rankProjectsByKeywords", () => {
  it("returns matches best first and drops the rest", () => {
    const titled = project({ id: "a", title: "Drought" });
    const narrated = withBackstory("A story about drought", { id: "b" });
    const unrelated = project({ id: "c", title: "Harbour" });

    const ranked = rankProjectsByKeywords([unrelated, narrated, titled], "drought");
    expect(ranked.map((doc) => doc.id)).toEqual(["a", "b"]);
  });

  it("breaks ties with the newest project", () => {
    const older = project({ id: "old", title: "Drought", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = project({ id: "new", title: "Drought", createdAt: "2026-02-01T00:00:00.000Z" });
    expect(rankProjectsByKeywords([older, newer], "drought").map((d) => d.id)).toEqual([
      "new",
      "old",
    ]);
  });
});
