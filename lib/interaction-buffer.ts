/**
 * Interaction ring buffer for issue diagnostics — the last few user actions
 * (clicks, field changes, form submits, route changes) leading up to a report.
 *
 * A module-level singleton mirroring lib/console-buffer.ts: installed once,
 * bounded, and stringified so it never retains DOM references.
 *
 * Privacy: we record WHAT was interacted with, never what was typed.
 * - `change` events store field identity only (tag/type/name) — `.value` is
 *   never read, and keystrokes are never observed (no keydown/input listener).
 * - Password fields keep their type but drop the name.
 * - Anything inside the screenshot-redaction conventions `.fc-redact` /
 *   `[data-fc-private]` is recorded as "[redacted]" with no other detail.
 * - Routes are pathnames only — query strings and fragments are stripped.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export interface InteractionEntry {
  kind: "click" | "input" | "submit" | "nav";
  /** ms since epoch */
  ts: number;
  /** Short selector for the interacted element, e.g. button#save.btn-primary */
  target?: string;
  /** Accessible-ish label: aria-label, button/link text, or placeholder */
  label?: string;
  /** Field identity for change events — never the value */
  field?: { tag: string; type: string | null; name: string | null };
  /** nav only: destination pathname */
  route?: string;
}

const MAX_ENTRIES = 30;
const MAX_TARGET_CHARS = 120;
const MAX_LABEL_CHARS = 60;

/** Matches the screenshot-redaction conventions in lib/screenshot.ts. */
const PRIVATE_SELECTOR = ".fc-redact, [data-fc-private]";

const INTERACTIVE_SELECTOR =
  'button, a, [role="button"], input, select, textarea, summary, label';

const buffer: InteractionEntry[] = [];
let installed = false;

function push(entry: InteractionEntry) {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

/** Compact selector: tag + #id + first couple of classes, truncated. */
export function describeTarget(el: Element): string {
  let out = el.tagName.toLowerCase();
  if (el.id) out += `#${el.id}`;
  const classes =
    typeof el.className === "string"
      ? el.className.split(/\s+/).filter(Boolean).slice(0, 2)
      : [];
  for (const c of classes) out += `.${c}`;
  // Password fields keep no identifying name anywhere in the entry.
  const name =
    el.getAttribute("type") === "password" ? null : el.getAttribute("name");
  if (name) out += `[name=${name}]`;
  return out.slice(0, MAX_TARGET_CHARS);
}

/** Best-effort human label for an element, truncated. */
export function describeLabel(el: Element): string | undefined {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.slice(0, MAX_LABEL_CHARS);
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return placeholder.slice(0, MAX_LABEL_CHARS);
  const tag = el.tagName.toLowerCase();
  if (tag === "button" || tag === "a" || tag === "summary" || tag === "label") {
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text) return text.slice(0, MAX_LABEL_CHARS);
  }
  return undefined;
}

function isPrivate(el: Element): boolean {
  return el.closest(PRIVATE_SELECTOR) !== null;
}

/** Strip query/fragment — pathname only, mirroring sanitizeHref. */
export function sanitizeRoute(href: string): string {
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
    return new URL(href, base).pathname;
  } catch {
    return href.split(/[?#]/)[0];
  }
}

function recordNav(pathname: string) {
  const last = buffer[buffer.length - 1];
  // Collapse consecutive duplicate nav entries (replaceState churn).
  if (last?.kind === "nav" && last.route === pathname) return;
  push({ kind: "nav", ts: Date.now(), route: pathname });
}

/**
 * Install once. Safe to call repeatedly and a no-op on the server.
 * Capture-phase, passive listeners — nothing here can affect app behavior.
 */
export function installInteractionBuffer(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  document.addEventListener(
    "click",
    (e) => {
      const raw = e.target;
      if (!(raw instanceof Element)) return;
      const el = raw.closest(INTERACTIVE_SELECTOR) ?? raw;
      if (isPrivate(el)) {
        push({ kind: "click", ts: Date.now(), target: "[redacted]" });
        return;
      }
      push({
        kind: "click",
        ts: Date.now(),
        target: describeTarget(el),
        label: describeLabel(el),
      });
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "change",
    (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (isPrivate(el)) {
        push({ kind: "input", ts: Date.now(), target: "[redacted]" });
        return;
      }
      const type = el.getAttribute("type");
      const isPassword = type === "password";
      push({
        kind: "input",
        ts: Date.now(),
        target: describeTarget(el),
        field: {
          tag: el.tagName.toLowerCase(),
          type,
          name: isPassword
            ? null
            : el.getAttribute("name") ??
              el.getAttribute("id") ??
              el.getAttribute("aria-label"),
        },
      });
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "submit",
    (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      push({
        kind: "submit",
        ts: Date.now(),
        target: isPrivate(el) ? "[redacted]" : describeTarget(el),
      });
    },
    { capture: true, passive: true },
  );

  // Client-side route changes: Next router goes through history.pushState /
  // replaceState; back/forward fires popstate.
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args) => {
    origPush(...args);
    recordNav(sanitizeRoute(window.location.href));
  };
  history.replaceState = (...args) => {
    origReplace(...args);
    recordNav(sanitizeRoute(window.location.href));
  };
  window.addEventListener("popstate", () => {
    recordNav(sanitizeRoute(window.location.href));
  });
}

/** Snapshot of the current buffer (most recent last). */
export function getInteractionEntries(): InteractionEntry[] {
  return buffer.slice();
}
