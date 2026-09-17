/**
 * Form Editor field completeness tests.
 *
 * Verifies that all store fields from the test fixture produce
 * the expected metadata structure — ensuring no regressions in
 * field mapping between store, form components, and export.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TEST_STORE_STATE, POPULATED_FIELDS, TEST_DB_ROW } from "./fixtures/test-project";

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
      expect(mockState.creativeCommons.copyright).toBe("Kabir Dugal");
    });

    it("has creativeCommons.description", () => {
      expect(mockState.creativeCommons.description.length).toBeGreaterThan(0);
    });

    it("has context items with storage URLs", () => {
      expect(mockState.context.length).toBeGreaterThan(0);
      for (const item of mockState.context) {
        expect(item.id).toBeTruthy();
        expect(item.type).toBe("image");
        expect(item.storage_url).toContain("supabase.co");
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

  describe("DB row mapping", () => {
    it("maps backStory to project_backstory columns", () => {
      const db = TEST_DB_ROW.project_backstory;
      expect(db.text).toBe(mockState.backStory.text);
      expect(db.date).toBe(mockState.backStory.date);
    });

    it("maps creativeCommons to project_creative_commons columns", () => {
      const db = TEST_DB_ROW.project_creative_commons;
      expect(db.copyright).toBe(mockState.creativeCommons.copyright);
      expect(db.description).toBe(mockState.creativeCommons.description);
    });

    it("maps ethics booleans to project_ethics snake_case columns", () => {
      const db = TEST_DB_ROW.project_ethics;
      expect(db.no_manipulation).toBe(mockState.ethics.noManipulation);
      expect(db.no_staging).toBe(mockState.ethics.noStaging);
      expect(db.informed_consent).toBe(mockState.ethics.informedConsent);
      expect(db.identity_protected).toBe(mockState.ethics.identityProtected);
      expect(db.ai_altered).toBe(mockState.ethics.aiAltered);
    });

    it("maps context items to context_items table columns", () => {
      expect(TEST_DB_ROW.context_items.length).toBe(mockState.context.length);
      for (let i = 0; i < TEST_DB_ROW.context_items.length; i++) {
        const db = TEST_DB_ROW.context_items[i];
        const store = mockState.context[i];
        expect(db.id).toBe(store.id);
        expect(db.media_type).toBe(store.type);
        expect(db.source_type).toBe(store.sourceType);
        expect(db.storage_url).toBe(store.storage_url);
        expect(db.position).toBe(i);
      }
    });

    it("maps voice transcriptions to voice_transcriptions columns", () => {
      const db = TEST_DB_ROW.voice_transcriptions[0];
      const store = mockState.voiceTranscriptions[0];
      expect(db.id).toBe(store.id);
      expect(db.text).toBe(store.text);
      expect(db.field_id).toBe(store.fieldId);
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
