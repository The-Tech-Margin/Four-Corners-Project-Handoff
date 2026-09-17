/**
 * Rate limiting — tiers, route classification, and caller identity.
 *
 * The counter itself is a port (lib/ports/rate-limit.ts); everything here
 * is the policy around it. Fail-open: an unreachable counter allows the
 * request rather than taking the site down.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { getRateLimitStore, peekSessionUserId } from "@/lib/adapters/proxy-runtime";
import { SESSION_COOKIE } from "@/lib/ports/auth";

/* ------------------------------------------------------------------ */
/*  Tier definitions                                                   */
/* ------------------------------------------------------------------ */

export type RateLimitTier =
  | "ai"
  | "write"
  | "read"
  | "auth"
  | "external"
  | "public"
  | "public_keyed";
export type IdentifierType = "user" | "ip" | "session";

interface TierConfig {
  maxRequests: number;
  windowSeconds: number;
  identifierType: IdentifierType;
}

export const RATE_LIMIT_TIERS: Record<RateLimitTier, TierConfig> = {
  ai:    { maxRequests: 10,   windowSeconds: 60, identifierType: "user" },
  write: { maxRequests: 30,   windowSeconds: 60, identifierType: "user" },
  read:  { maxRequests: 100,  windowSeconds: 60, identifierType: "ip" },
  // Auth: sign-in/sign-up/password-reset attempts, per IP.
  auth:  { maxRequests: 10,   windowSeconds: 60, identifierType: "ip" },
  // External fetches on the caller's behalf (link previews, geocoding).
  external: { maxRequests: 30, windowSeconds: 60, identifierType: "ip" },
  // Public gallery API: open to anonymous callers (per-IP), with a higher
  // ceiling unlocked by presenting a valid Bearer API key (per-key).
  public:        { maxRequests: 100,  windowSeconds: 60, identifierType: "ip" },
  public_keyed:  { maxRequests: 1000, windowSeconds: 60, identifierType: "ip" },
};

/* ------------------------------------------------------------------ */
/*  Route classification                                               */
/* ------------------------------------------------------------------ */

/**
 * Map a request path + method to a rate-limit tier.
 * Returns `null` for exempt routes (e.g. /api/vitals).
 */
export function classifyRoute(
  pathname: string,
  method: string,
): RateLimitTier | null {
  // AI routes — expensive external calls
  if (pathname.startsWith("/api/ai")) return "ai";

  // Storage routes — always writes
  if (pathname.startsWith("/api/storage")) return "write";

  // Auth: credential attempts are cheap to send and expensive to guess.
  if (pathname.startsWith("/api/auth")) return "auth";

  // Projects: method-dependent
  if (pathname.startsWith("/api/projects")) {
    const upper = method.toUpperCase();
    if (upper === "POST" || upper === "PUT" || upper === "DELETE" || upper === "PATCH") {
      return "write";
    }
    return "read";
  }

  // Outbound fetches made on the caller's behalf.
  if (pathname === "/api/link-preview") return "external";
  if (pathname.startsWith("/api/geocode")) return "external";

  // Read-only endpoints
  if (
    pathname.startsWith("/api/gallery") ||
    pathname.startsWith("/api/public/")
  ) {
    return "read";
  }

  // Default: read
  return "read";
}

/* ------------------------------------------------------------------ */
/*  Identifier extraction                                              */
/* ------------------------------------------------------------------ */

/**
 * SHA-256 hash, truncated to 16 hex characters.
 * Uses Web Crypto API for Edge Runtime compatibility.
 */
async function hashIdentifier(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

/**
 * Extract and hash an identifier from the request.
 *
 * - `user`: the id from a verified session cookie
 * - `ip`: read forwarded-for / real-ip header
 * - `session`: try user first, fall back to IP
 */
export async function extractIdentifier(
  request: Request,
  identifierType: IdentifierType,
): Promise<string | null> {
  if (identifierType === "user" || identifierType === "session") {
    // The session cookie is verified, not just parsed: a forged cookie
    // cannot borrow another account's quota.
    const userId = peekSessionUserId(sessionCookieValue(request));
    if (userId) return hashIdentifier(`user:${userId}`);
  }

  return extractIpIdentifier(request);
}

/** Read our own session cookie out of the request's Cookie header. */
function sessionCookieValue(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === SESSION_COOKIE) {
      return pair.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function extractIpIdentifier(request: Request): Promise<string | null> {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
  return hashIdentifier(`ip:${ip}`);
}

/* ------------------------------------------------------------------ */
/*  Public API key (optional Bearer auth)                              */
/* ------------------------------------------------------------------ */

/**
 * Valid public-API keys, read from the `PUBLIC_API_KEYS` env var
 * (comma-separated). Unset → no keys, so every public request is
 * treated as anonymous (still allowed, just the lower tier).
 */
function getApiKeys(): Set<string> {
  const raw = process.env.PUBLIC_API_KEYS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Extract a Bearer token from the Authorization header, if present. */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function isValidApiKey(token: string): boolean {
  return getApiKeys().has(token);
}

/**
 * Resolve the rate-limit plan for a public-API request.
 *
 * - Valid Bearer key → `public_keyed` tier, limited per-key.
 * - No / invalid key  → `public` tier, limited per-IP (still allowed).
 */
export async function resolvePublicApiRateLimit(
  request: Request,
): Promise<{ tier: RateLimitTier; identifier: string }> {
  const token = extractBearerToken(request);
  if (token && isValidApiKey(token)) {
    return {
      tier: "public_keyed",
      identifier: await hashIdentifier(`apikey:${token}`),
    };
  }
  const ip = await extractIpIdentifier(request);
  return {
    tier: "public",
    identifier: ip ?? (await hashIdentifier("ip:unknown")),
  };
}

/* ------------------------------------------------------------------ */
/*  Rate limit check                                                   */
/* ------------------------------------------------------------------ */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
}

/**
 * Check one request against its tier. Fail-open: a counter that cannot be
 * reached must not take the site down with it.
 */
export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier,
  _endpoint: string,
  _method: string,
): Promise<RateLimitResult> {
  const config = RATE_LIMIT_TIERS[tier];

  try {
    return await getRateLimitStore().hit(`${tier}:${identifier}`, {
      limit: config.maxRequests,
      windowSeconds: config.windowSeconds,
    });
  } catch (error) {
    console.error("rate limit check failed — allowing the request", error);
    return {
      allowed: true,
      remaining: config.maxRequests,
      limit: config.maxRequests,
      resetAt: new Date(Date.now() + config.windowSeconds * 1000).toISOString(),
    };
  }
}
