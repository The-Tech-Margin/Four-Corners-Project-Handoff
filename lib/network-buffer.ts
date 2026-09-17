/**
 * Failed-request ring buffer for issue diagnostics.
 *
 * A module-level singleton (mirrors lib/console-buffer.ts) that wraps
 * window.fetch once and records only FAILURES — HTTP >= 400 or a thrown
 * fetch — so a ticket shows which API calls broke just before the report.
 *
 * Privacy: request/response BODIES and headers are never read. URLs are
 * stored origin + pathname only (query strings can carry signed-URL secrets).
 * AbortError is skipped — aborted fetches are routine during navigation.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export interface NetworkEntry {
  method: string;
  /** origin + pathname only — query/fragment stripped */
  url: string;
  /** HTTP status, or null when the fetch itself threw */
  status: number | null;
  durationMs: number;
  /** ms since epoch */
  ts: number;
  /** "TypeError: Failed to fetch" style summary when thrown */
  error?: string;
}

const MAX_ENTRIES = 20;
const MAX_ERROR_CHARS = 200;

const buffer: NetworkEntry[] = [];
let installed = false;

function push(entry: NetworkEntry) {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

/** Strip query/fragment; skip non-http(s) schemes by returning null. */
export function sanitizeRequestUrl(raw: string): string | null {
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Install once. Safe to call repeatedly and a no-op on the server. The
 * original fetch is always invoked and its result/throw passed through
 * untouched — recording is observation only.
 */
export function installNetworkBuffer(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const origFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = Date.now();
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    try {
      const res = await origFetch(input as RequestInfo, init);
      if (!res.ok) {
        const url = sanitizeRequestUrl(rawUrl);
        if (url) {
          push({
            method,
            url,
            status: res.status,
            durationMs: Date.now() - started,
            ts: started,
          });
        }
      }
      return res;
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        const url = sanitizeRequestUrl(rawUrl);
        if (url) {
          const summary =
            err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          push({
            method,
            url,
            status: null,
            durationMs: Date.now() - started,
            ts: started,
            error: summary.slice(0, MAX_ERROR_CHARS),
          });
        }
      }
      throw err;
    }
  };
}

/** Snapshot of the current buffer (most recent last). */
export function getNetworkEntries(): NetworkEntry[] {
  return buffer.slice();
}
