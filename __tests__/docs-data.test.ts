/**
 * Doc builder output tests.
 *
 * Verifies the generated in-app docs data (app/docs/_data/docsData.ts) stays in
 * sync with its source of truth — the field registry and the OpenAPI spec. If
 * any of these fail, the docs data has drifted and must be regenerated:
 *   npm run generate:docs
 *
 * This mirrors the CI "docs freshness" check (.github/workflows/docs.yml) at the
 * data-shape level, so drift is caught in the unit suite too.
 */

import { describe, it, expect } from "vitest";
import { docsData } from "@/app/docs/_data/docsData";
import {
  FIELD_REGISTRY,
  ContextItemSchema,
  LinkSchema,
  VoiceTranscriptionSchema,
} from "@/lib/field-registry";
import { buildOpenAPISpec } from "@/lib/openapi-spec";

const PROD_BASE_URL = "https://four-corners.thetechmargin.com";

/** Field `path`s registered against a given uiSection, in registry order. */
const pathsForSection = (section: string) =>
  Object.values(FIELD_REGISTRY)
    .filter((f) => f.uiSection === section)
    .map((f) => f.path);

describe("docs builder output (app/docs/_data/docsData)", () => {
  it("emits the four corners in canvas order with editor color tokens", () => {
    expect(docsData.corners.map((c) => c.key)).toEqual([
      "context",
      "links",
      "backstory",
      "authorship",
    ]);
    // Tokens must match the editor's --fc-corner-* variables.
    expect(docsData.corners.map((c) => c.token)).toEqual([
      "context",
      "links",
      "backstory",
      "cc",
    ]);
  });

  it("derives backstory + authorship fields from FIELD_REGISTRY uiSections", () => {
    const backstory = docsData.corners.find((c) => c.key === "backstory")!;
    expect(backstory.fields.map((f) => f.key)).toEqual(pathsForSection("backstory"));
    expect(backstory.fields.length).toBeGreaterThan(0);

    const authorship = docsData.corners.find((c) => c.key === "authorship")!;
    expect(authorship.fields.map((f) => f.key)).toEqual(
      pathsForSection("caption-credit-ethics"),
    );
    expect(authorship.fields.length).toBeGreaterThan(0);
  });

  it("derives the collection corners from their Zod schemas", () => {
    // The builder walks the schema's own field order and keeps the allowed set,
    // so expected order follows ContextItemSchema.shape, not the allow-list.
    const context = docsData.corners.find((c) => c.key === "context")!;
    const contextAllowed = new Set(["caption", "description", "credit", "date", "type"]);
    expect(context.fields.map((f) => f.key)).toEqual(
      Object.keys(ContextItemSchema.shape).filter((k) => contextAllowed.has(k)),
    );

    const links = docsData.corners.find((c) => c.key === "links")!;
    expect(links.fields.map((f) => f.key)).toEqual(Object.keys(LinkSchema.shape));
  });

  it("covers the three cross-cutting sections", () => {
    expect(docsData.crossCutting.map((c) => c.key)).toEqual([
      "location",
      "camera-metadata",
      "voice",
    ]);

    const location = docsData.crossCutting.find((c) => c.key === "location")!;
    expect(location.fields.map((f) => f.key)).toEqual(pathsForSection("location"));

    const voice = docsData.crossCutting.find((c) => c.key === "voice")!;
    const voiceAllowed = new Set(["text", "fieldId"]);
    expect(voice.fields.map((f) => f.key)).toEqual(
      Object.keys(VoiceTranscriptionSchema.shape).filter((k) => voiceAllowed.has(k)),
    );
  });

  it("mirrors the OpenAPI spec in the API table", () => {
    const spec = buildOpenAPISpec(PROD_BASE_URL);
    expect(docsData.api.map((a) => a.path)).toEqual(Object.keys(spec.paths));
    expect(docsData.api.length).toBeGreaterThan(0);
    for (const route of docsData.api) {
      expect(route.method).toBe(route.method.toUpperCase());
      expect(route.method.length).toBeGreaterThan(0);
    }
  });

  it("carries a deterministic source date and the production base URL", () => {
    // generatedAt is a stable YYYY-MM-DD (git commit date), never a wall clock,
    // so regeneration is reproducible and the freshness check doesn't churn.
    expect(docsData.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(docsData.apiInfo.baseUrl).toBe(PROD_BASE_URL);
  });

  it("carries a non-empty, well-formed version history (newest first)", () => {
    expect(docsData.versionHistory.length).toBeGreaterThan(0);
    for (const v of docsData.versionHistory) {
      expect(v.version).toBeTruthy();
      expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.summary).toBeTruthy();
      expect(Array.isArray(v.changes)).toBe(true);
      expect(v.changes.length).toBeGreaterThan(0);
    }
    // Dates are sorted descending (newest first).
    const dates = docsData.versionHistory.map((v) => v.date);
    expect([...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))).toEqual(dates);
  });

  it("includes onboarding steps and the visibility-state model", () => {
    expect(docsData.gettingStarted.length).toBeGreaterThan(0);
    // Steps are numbered 1..N in order.
    expect(docsData.gettingStarted.map((s) => s.n)).toEqual(
      docsData.gettingStarted.map((_, i) => i + 1),
    );

    // A project is only public when BOTH flags are on.
    const publicState = docsData.visibility.find((v) => v.published && v.inGallery);
    expect(publicState).toBeDefined();
    const draft = docsData.visibility.find((v) => !v.published && !v.inGallery);
    expect(draft).toBeDefined();
  });
});
