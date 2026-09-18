/**
 * Share ids: a project id round-trips, and a human-readable slug passes
 * through untouched — even when its dashes make it look like base64.
 */

import { describe, it, expect } from "vitest";
import { decodeProjectId, encodeProjectId } from "@/lib/encode-id";

const PROJECT_ID = "b4f669bc-d9ad-4699-b947-d2cf4fe82528";

describe("project share ids", () => {
  it("round-trips an id", () => {
    const encoded = encodeProjectId(PROJECT_ID);
    expect(encoded).not.toBe(PROJECT_ID);
    expect(decodeProjectId(encoded)).toBe(PROJECT_ID);
  });

  it("leaves a slug alone", () => {
    for (const slug of ["harbour-morning", "diptych-richmond-va", "one", "a-b-c-d"]) {
      expect(decodeProjectId(slug)).toBe(slug);
    }
  });

  it("passes a bare id through", () => {
    expect(decodeProjectId(PROJECT_ID)).toBe(PROJECT_ID);
  });

  it("treats empty input as empty", () => {
    expect(encodeProjectId("")).toBe("");
    expect(decodeProjectId("")).toBe("");
  });
});
