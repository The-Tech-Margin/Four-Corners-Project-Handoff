/**
 * Client-side admin status — cached, deduped check of GET /api/admin/auth.
 *
 * The header menu remounts on every page navigation and the admin layout
 * re-checks on every pathname change, so naive per-mount fetches both hammer
 * the admin rate-limit tier (30 req/min) and lose state across remounts.
 * This module-level cache survives client-side navigation: remounted callers
 * render from the last-known-good value instantly and revalidate when stale.
 *
 * Rate-limit safety: a 429/5xx response REJECTS instead of resolving with
 * authenticated=false, so callers keep their prior state. Only an
 * authoritative 200 with authenticated:false should revoke admin UI.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export interface AdminStatus {
  authenticated: boolean;
  role: "super_admin" | "admin" | "moderator" | null;
  pendingInvites: number;
}

/** Re-use a successful result for this long before revalidating. */
const TTL_MS = 30_000;

let cached: { value: AdminStatus; fetchedAt: number } | null = null;
let inflight: Promise<AdminStatus> | null = null;

function normalize(d: unknown): AdminStatus {
  const data = (d ?? {}) as Record<string, unknown>;
  const role = data.role;
  return {
    authenticated: data.authenticated === true,
    role:
      role === "super_admin" || role === "admin" || role === "moderator"
        ? role
        : null,
    pendingInvites:
      typeof data.pendingInvites === "number" ? data.pendingInvites : 0,
  };
}

async function doFetch(): Promise<AdminStatus> {
  const res = await fetch("/api/admin/auth", { cache: "no-store" });
  if (!res.ok) {
    // Rate-limited or transient server error — not an auth verdict.
    throw new Error(`admin status check failed: ${res.status}`);
  }
  const value = normalize(await res.json());
  cached = { value, fetchedAt: Date.now() };
  return value;
}

/**
 * Fetch the current admin status. Within the TTL the cached value is
 * returned without a network call; concurrent callers share one request.
 * Pass `force: true` to bypass the TTL (e.g. when opening the menu so the
 * pending-invites badge is fresh) — in-flight dedupe still applies.
 *
 * Rejects on non-OK responses; callers should keep their prior state.
 */
export function fetchAdminStatus(opts?: {
  force?: boolean;
}): Promise<AdminStatus> {
  if (
    !opts?.force &&
    cached &&
    Date.now() - cached.fetchedAt < TTL_MS
  ) {
    return Promise.resolve(cached.value);
  }
  if (!inflight) {
    inflight = doFetch().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Last-known-good status for synchronous initial render, if any. */
export function getCachedAdminStatus(): AdminStatus | null {
  return cached?.value ?? null;
}

/** Drop the cache (e.g. after sign-out) so the next check is fresh. */
export function clearAdminStatusCache(): void {
  cached = null;
}
