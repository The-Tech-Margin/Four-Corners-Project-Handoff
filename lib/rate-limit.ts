/**
 * Rate limiting — Supabase-backed sliding window.
 *
 * Uses an RPC function (`check_rate_limit`) that atomically counts
 * recent requests and inserts a log entry. Fail-open: if the RPC
 * call fails, the request is allowed through.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

/* ------------------------------------------------------------------ */
/*  Tier definitions                                                   */
/* ------------------------------------------------------------------ */

export type RateLimitTier =
  | "ai"
  | "write"
  | "read"
  | "admin"
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
  // Admin: all /api/admin/* routes share one bucket per session, and a single
  // dashboard load fires ~5 parallel requests — 120/min gives real headroom.
  admin: { maxRequests: 120,  windowSeconds: 60, identifierType: "session" },
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
  // Exempt: monitoring + Vercel log drains (signature-verified, server-to-server)
  if (pathname === "/api/vitals") return null;
  if (pathname.startsWith("/api/drains/")) return null;

  // Admin routes
  if (pathname.startsWith("/api/admin")) return "admin";

  // AI routes — expensive external calls
  if (pathname.startsWith("/api/ai")) return "ai";

  // Storage routes — always writes
  if (pathname.startsWith("/api/storage")) return "write";

  // Tickets — create (POST /api/issues) and reporter updates
  // (PATCH /api/issues/[id]) are writes; listing/reading own tickets is read.
  if (pathname.startsWith("/api/issues")) {
    const upper = method.toUpperCase();
    return upper === "POST" || upper === "PUT" || upper === "DELETE" || upper === "PATCH"
      ? "write"
      : "read";
  }

  // Invite flow — public request + token acceptance are writes; lookup is read.
  if (pathname === "/api/invites/request") return "write";
  if (pathname === "/api/invites/accept") return "write";
  if (pathname === "/api/invites/lookup") return "read";

  // Projects: method-dependent
  if (pathname.startsWith("/api/projects")) {
    const upper = method.toUpperCase();
    if (upper === "POST" || upper === "PUT" || upper === "DELETE" || upper === "PATCH") {
      return "write";
    }
    return "read";
  }

  // Dev-auth — treat as write (mutation)
  if (pathname === "/api/dev-auth") return "write";

  // OAuth — treat as write
  if (pathname.startsWith("/api/oauth")) return "write";

  // Read-only endpoints
  if (
    pathname.startsWith("/api/palettes") ||
    pathname.startsWith("/api/gallery") ||
    pathname.startsWith("/api/public/") ||
    pathname === "/api/link-preview"
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
 * - `user`: decode Supabase JWT from cookie, extract `sub` claim
 * - `ip`: read forwarded-for / real-ip header
 * - `session`: try user first, fall back to IP
 */
export async function extractIdentifier(
  request: Request,
  identifierType: IdentifierType,
): Promise<string | null> {
  if (identifierType === "user" || identifierType === "session") {
    const userId = extractUserIdFromCookie(request);
    if (userId) return hashIdentifier(`user:${userId}`);
    // Session falls through to IP; pure user type returns null
    if (identifierType === "user") {
      // Fall back to IP even for user type — unauthenticated requests
      // still need rate limiting
      return extractIpIdentifier(request);
    }
  }

  return extractIpIdentifier(request);
}

function extractIpIdentifier(request: Request): Promise<string | null> {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
  return hashIdentifier(`ip:${ip}`);
}

/**
 * Decode the Supabase JWT from the auth cookie without verification.
 * We only need a stable user identifier — actual auth happens in routes.
 */
function extractUserIdFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  // Supabase stores auth in cookies with varying names.
  // Look for the base64-encoded auth token cookie.
  // Format: sb-<project-ref>-auth-token=base64(json)
  // or sb-<project-ref>-auth-token.0, .1, etc. (chunked)
  const cookies = parseCookies(cookieHeader);

  // Find the auth token cookie
  let tokenValue: string | null = null;

  for (const [name, value] of Object.entries(cookies)) {
    if (name.startsWith("sb-") && name.includes("-auth-token")) {
      // Could be chunked: reassemble .0, .1, .2, etc.
      if (name.endsWith("-auth-token")) {
        // Check for chunked cookies
        const chunks: string[] = [];
        let i = 0;
        while (cookies[`${name}.${i}`]) {
          chunks.push(cookies[`${name}.${i}`]);
          i++;
        }
        tokenValue = chunks.length > 0 ? chunks.join("") : value;
        break;
      }
    }
  }

  if (!tokenValue) return null;

  try {
    // The cookie value is base64-encoded JSON containing access_token
    const decoded = atob(tokenValue);
    const parsed = JSON.parse(decoded);
    const accessToken = parsed?.access_token || parsed;

    if (typeof accessToken === "string" && accessToken.includes(".")) {
      // JWT: header.payload.signature — decode the payload
      const payloadB64 = accessToken.split(".")[1];
      const payload = JSON.parse(atob(payloadB64));
      return payload.sub || null;
    }
  } catch {
    // Not a valid JWT — ignore
  }

  return null;
}

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    cookies[key] = val;
  }
  return cookies;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _serviceClient: SupabaseClient<any, any, any> | null = null;

function getServiceClient() {
  if (_serviceClient) return _serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  _serviceClient = createClient(url, key);
  return _serviceClient;
}

/**
 * Check rate limit via Supabase RPC.
 * Fail-open: returns allowed=true if the check fails.
 */
export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier,
  endpoint: string,
  method: string,
): Promise<RateLimitResult> {
  const config = RATE_LIMIT_TIERS[tier];
  const fallback: RateLimitResult = {
    allowed: true,
    remaining: config.maxRequests,
    limit: config.maxRequests,
    resetAt: new Date(Date.now() + config.windowSeconds * 1000).toISOString(),
  };

  const sb = getServiceClient();
  if (!sb) return fallback;

  try {
    const { data, error } = await sb.rpc("check_rate_limit", {
      p_identifier: identifier,
      p_tier: tier,
      p_endpoint: endpoint,
      p_method: method,
      p_window_seconds: config.windowSeconds,
      p_max_requests: config.maxRequests,
    });

    if (error) {
      console.error("[rate-limit] RPC error:", error.message);
      return fallback;
    }

    return {
      allowed: data.allowed,
      remaining: data.remaining,
      limit: data.limit,
      resetAt: data.reset_at,
    };
  } catch (err) {
    console.error("[rate-limit] Check failed:", err);
    return fallback;
  }
}
