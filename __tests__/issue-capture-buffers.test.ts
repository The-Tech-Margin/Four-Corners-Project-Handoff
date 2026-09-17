/**
 * Issue diagnostics buffers — pure helper tests (node env, no DOM).
 *
 * Covers the selector/label builders and URL sanitizers that feed the
 * interaction + network ring buffers. The install functions wrap globals
 * (document/fetch/history) and are exercised in the browser, not here.
 */

import { describe, it, expect } from "vitest";
import {
  describeTarget,
  describeLabel,
  sanitizeRoute,
} from "@/lib/interaction-buffer";
import { sanitizeRequestUrl } from "@/lib/network-buffer";

/** Minimal Element stand-in for the pure describe* helpers. */
function fakeEl(props: {
  tagName?: string;
  id?: string;
  className?: string;
  attrs?: Record<string, string>;
  textContent?: string;
}): Element {
  return {
    tagName: props.tagName ?? "BUTTON",
    id: props.id ?? "",
    className: props.className ?? "",
    textContent: props.textContent ?? "",
    getAttribute: (name: string) => props.attrs?.[name] ?? null,
  } as unknown as Element;
}

describe("describeTarget", () => {
  it("builds tag#id.class selectors, capped at two classes", () => {
    const el = fakeEl({ id: "save", className: "btn primary large extra" });
    expect(describeTarget(el)).toBe("button#save.btn.primary");
  });
  it("includes [name=…] when present", () => {
    const el = fakeEl({ tagName: "INPUT", attrs: { name: "title" } });
    expect(describeTarget(el)).toBe("input[name=title]");
  });
  it("truncates to 120 chars", () => {
    const el = fakeEl({ id: "x".repeat(300) });
    expect(describeTarget(el).length).toBeLessThanOrEqual(120);
  });
  it("omits [name=…] for password fields", () => {
    const el = fakeEl({
      tagName: "INPUT",
      attrs: { type: "password", name: "super-secret" },
    });
    expect(describeTarget(el)).toBe("input");
  });
});

describe("describeLabel", () => {
  it("prefers aria-label", () => {
    const el = fakeEl({ attrs: { "aria-label": "Save project" }, textContent: "Save" });
    expect(describeLabel(el)).toBe("Save project");
  });
  it("falls back to button text, collapsed and truncated", () => {
    const el = fakeEl({ textContent: "  Save \n project  " });
    expect(describeLabel(el)).toBe("Save project");
  });
  it("does not read text from non-interactive tags", () => {
    const el = fakeEl({ tagName: "DIV", textContent: "private content" });
    expect(describeLabel(el)).toBeUndefined();
  });
  it("truncates long labels to 60 chars", () => {
    const el = fakeEl({ attrs: { "aria-label": "y".repeat(200) } });
    expect(describeLabel(el)?.length).toBeLessThanOrEqual(60);
  });
});

describe("sanitizeRoute", () => {
  it("strips query strings and fragments", () => {
    expect(sanitizeRoute("/projects/abc?token=secret#frag")).toBe("/projects/abc");
  });
  it("reduces absolute URLs to their pathname", () => {
    expect(sanitizeRoute("https://example.com/view/x?sig=abc")).toBe("/view/x");
  });
});

describe("sanitizeRequestUrl", () => {
  it("keeps origin + pathname, dropping query/fragment", () => {
    expect(sanitizeRequestUrl("https://api.example.com/v1/items?key=secret#x")).toBe(
      "https://api.example.com/v1/items",
    );
  });
  it("resolves relative URLs against a base", () => {
    expect(sanitizeRequestUrl("/api/issues?limit=5")).toBe(
      "http://localhost/api/issues",
    );
  });
  it("returns null for non-http(s) schemes", () => {
    expect(sanitizeRequestUrl("data:text/plain;base64,xyz")).toBeNull();
    expect(sanitizeRequestUrl("blob:https://example.com/uuid")).toBeNull();
  });
});
