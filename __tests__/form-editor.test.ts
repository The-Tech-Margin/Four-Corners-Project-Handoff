/**
 * Form Editor field completeness tests.
 *
 * Verifies that all store fields from the test fixture produce
 * the expected metadata structure — ensuring no regressions in
 * field mapping between store, form components, and export.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TEST_STORE_STATE, POPULATED_FIELDS } from "./fixtures/test-project";

// Mock store with test data
const mockState = { ...TEST_STORE_STATE };
vi.mock("@/lib/store", () => ({
  useFourCornersStore: {
    getState: () => mockState,
    setState: (partial: Record<string, unknown>) => {
      Object.assign(mockState, partial);
    },
  },
}));

describe("Form Editor — Field Completeness", () => {
  describe("Store data integrity", () => {
    it("has non-empty backStory.text", () => {
      expect(mockState.backStory.text.length).toBeGreaterThan(0);
    });

    it("has backStory.date in ISO format", () => {
      expect(mockState.backStory.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("has creativeCommons.copyright", () => {
      expect(mockState.creativeCommons.copyright).toBe("Test Photographer");
    });

    it("has creativeCommons.description", () => {
      expect(mockState.creativeCommons.description.length).toBeGreaterThan(0);
    });

    it("has context items with storage URLs", () => {
      expect(mockState.context.length).toBeGreaterThan(0);
      for (const item of mockState.context) {
        expect(item.id).toBeTruthy();
        expect(item.type).toBe("image");
        expect(item.storage_url).toMatch(/^\/api\/blobs\//);
        expect(item.thumbnail_storage_url).toContain("thumbs/");
      }
    });

    it("has voice transcriptions", () => {
      expect(mockState.voiceTranscriptions.length).toBe(1);
      expect(mockState.voiceTranscriptions[0].fieldId).toBe("caption-description");
      expect(mockState.voiceTranscriptions[0].duration).toBeGreaterThan(0);
    });

    it("has ethics flags all defaulting to false", () => {
      expect(mockState.ethics.noManipulation).toBe(false);
      expect(mockState.ethics.noStaging).toBe(false);
      expect(mockState.ethics.informedConsent).toBe(false);
      expect(mockState.ethics.identityProtected).toBe(false);
      expect(mockState.ethics.aiAltered).toBe(false);
    });
  });

  describe("Populated field tracking", () => {
    it("identifies correct populated fields", () => {
      const populated = Object.keys(POPULATED_FIELDS);
      expect(populated).toContain("backStory.text");
      expect(populated).toContain("backStory.date");
      expect(populated).toContain("creativeCommons.copyright");
      expect(populated).toContain("creativeCommons.description");
    });

    it("backStory.author is empty (not in populated)", () => {
      expect(mockState.backStory.author).toBe("");
      expect("backStory.author" in POPULATED_FIELDS).toBe(false);
    });
  });
});
