/**
 * Help launcher entry-builder tests — the authenticated / unauthenticated /
 * admin gating that mirrors the menu-help paradigm.
 */
import { describe, it, expect } from "vitest";
import {
  buildHelpEntries,
  filterHelpEntries,
  type HelpEntry,
} from "@/lib/help-entries";

const ids = (entries: HelpEntry[]) => entries.map((e) => e.id);
const routeOf = (entries: HelpEntry[], id: string) => {
  const action = entries.find((e) => e.id === id)?.action;
  return action?.type === "route" ? action.href : undefined;
};

describe("buildHelpEntries", () => {
  it("logged-out: shows public help + sign-in, hides workspace/creator-only", () => {
    const entries = buildHelpEntries({ isAuthed: false });
    const seen = ids(entries);
    expect(seen).toContain("sign-in");
    expect(seen).toContain("gallery");
    expect(seen).not.toContain("new-project");
    expect(seen).not.toContain("editor");
    expect(seen).not.toContain("dashboard");
    expect(seen).not.toContain("help-field-reference");
    expect(seen).not.toContain("theme");
    // public help points at /docs, not the gated creator guide
    expect(routeOf(entries, "help-getting-started")).toBe("/docs#getting-started");
  });

  it("authed: adds workspace + creator-anchored help + theme, drops sign-in", () => {
    const entries = buildHelpEntries({ isAuthed: true });
    const seen = ids(entries);
    expect(seen).toContain("new-project");
    expect(seen).toContain("editor");
    expect(seen).toContain("dashboard");
    expect(seen).toContain("help-field-reference");
    expect(seen).toContain("theme");
    expect(seen).not.toContain("sign-in");
    expect(routeOf(entries, "help-getting-started")).toBe("/docs/creator#getting-started");
  });

  it("every entry carries a --fc-corner-* accent token", () => {
    const entries = buildHelpEntries({ isAuthed: true });
    for (const entry of entries) {
      expect(entry.accentToken.startsWith("--fc-corner-")).toBe(true);
    }
  });
});

describe("filterHelpEntries", () => {
  const entries = buildHelpEntries({ isAuthed: true });

  it("matches across title, subtitle, and keywords", () => {
    expect(filterHelpEntries(entries, "gallery").some((e) => e.id === "gallery")).toBe(true);
    // "persona" only lives in the theme entry's keywords
    expect(filterHelpEntries(entries, "persona").map((e) => e.id)).toContain("theme");
  });

  it("returns the full set for an empty query", () => {
    expect(filterHelpEntries(entries, "")).toHaveLength(entries.length);
  });
});
