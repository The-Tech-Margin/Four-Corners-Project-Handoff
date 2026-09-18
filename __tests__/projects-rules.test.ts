import { describe, it, expect } from "vitest";
import { applyVisibilityChange, forkFields, lineageRootId } from "@/lib/projects/rules";
import { GalleryLimitError } from "@/lib/ports/errors";
import type { ProjectDocument } from "@/lib/projects/types";
import { createEmptyMetadata } from "@/lib/schema";

function project(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: "p1",
    ownerId: "u1",
    slug: "harbour-morning",
    title: "Harbour morning",
    metadata: createEmptyMetadata(),
    mainImage: null,
    published: false,
    inGallery: false,
    tags: [],
    lineage: {
      parentProjectId: null,
      versionNumber: 1,
      forkedFromUserId: null,
      isFork: false,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const unlimited = { otherInGalleryCount: 0, galleryLimit: null };

describe("applyVisibilityChange", () => {
  it("publishing alone does not list the project in the gallery", () => {
    const next = applyVisibilityChange(project(), { published: true }, unlimited);
    expect(next.published).toBe(true);
    expect(next.inGallery).toBe(false);
  });

  it("adding to the gallery publishes the project", () => {
    const next = applyVisibilityChange(project(), { inGallery: true }, unlimited);
    expect(next.published).toBe(true);
    expect(next.inGallery).toBe(true);
  });

  it("unpublishing removes it from the gallery", () => {
    const listed = project({ published: true, inGallery: true });
    const next = applyVisibilityChange(listed, { published: false }, unlimited);
    expect(next.published).toBe(false);
    expect(next.inGallery).toBe(false);
  });

  it("returns the same document when nothing changes", () => {
    const listed = project({ published: true, inGallery: true });
    expect(applyVisibilityChange(listed, { published: true }, unlimited)).toBe(listed);
  });

  it("enforces the configured gallery limit", () => {
    expect(() =>
      applyVisibilityChange(project(), { inGallery: true }, {
        otherInGalleryCount: 1,
        galleryLimit: 1,
      }),
    ).toThrow(GalleryLimitError);
  });

  it("lets an already-listed project stay listed at the limit", () => {
    const listed = project({ published: true, inGallery: true });
    const next = applyVisibilityChange(listed, { published: true, inGallery: true }, {
      otherInGalleryCount: 1,
      galleryLimit: 1,
    });
    expect(next.inGallery).toBe(true);
  });
});

describe("lineage", () => {
  it("roots at the project itself until it has a parent", () => {
    expect(lineageRootId(project())).toBe("p1");
    expect(
      lineageRootId(
        project({
          lineage: {
            parentProjectId: "root",
            versionNumber: 2,
            forkedFromUserId: null,
            isFork: false,
          },
        }),
      ),
    ).toBe("root");
  });

  it("marks a copy of someone else's project as a fork", () => {
    expect(forkFields(project(), "u1")).toEqual({ isFork: false, forkedFromUserId: null });
    expect(forkFields(project(), "u2")).toEqual({ isFork: true, forkedFromUserId: "u1" });
  });
});
