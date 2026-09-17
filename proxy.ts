/**
 * API proxy — rate limiting + auth protection.
 *
 * Next.js 16 uses proxy.ts instead of middleware.ts.
 * Rate limiting is Supabase-backed (sliding window via RPC).
 * Fail-open: if the rate-limit check fails, requests proceed.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEV_AUTH_COOKIE, isDevAuthEnabled } from "@/lib/dev-auth";
import {
  classifyRoute,
  extractIdentifier,
  checkRateLimit,
  resolvePublicApiRateLimit,
  RATE_LIMIT_TIERS,
  type RateLimitTier,
} from "@/lib/rate-limit";
import { getSupabasePublicKey } from "@/lib/supabase/public-key";

/**
 * Run the rate-limit check for a resolved identifier/tier and translate
 * the result into either a 429 or a pass-through with quota headers.
 */
async function applyRateLimit(
  identifier: string,
  tier: RateLimitTier,
  pathname: string,
  method: string,
) {
  const result = await checkRateLimit(identifier, tier, pathname, method);

  if (!result.allowed) {
    const retryAfter = Math.ceil(
      (new Date(result.resetAt).getTime() - Date.now()) / 1000,
    );

    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, retryAfter)),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": result.resetAt,
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", result.resetAt);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // ── Defense in depth: block dev-auth in production ──────────────
  if (pathname === "/api/dev-auth" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Rate limiting for API routes ───────────────────────────────
  // Gallery is public, read-only, and CDN-cached — skip the Supabase
  // RPC round-trip so cached responses return in <5ms instead of 200-500ms.
  if (pathname === "/api/gallery") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    // Public gallery API: optional Bearer key unlocks a higher tier.
    // Anonymous callers are still served, just at the lower per-IP tier.
    if (pathname.startsWith("/api/public/")) {
      const { tier, identifier } = await resolvePublicApiRateLimit(request);
      return applyRateLimit(identifier, tier, pathname, method);
    }

    const tier = classifyRoute(pathname, method);

    if (tier) {
      const config = RATE_LIMIT_TIERS[tier];
      const identifier = await extractIdentifier(request, config.identifierType);

      if (identifier) {
        return applyRateLimit(identifier, tier, pathname, method);
      }
    }

    // Exempt route or can't identify — pass through
    return NextResponse.next();
  }

  // ── Protect authenticated routes ───────────────────────────────
  const protectedPaths = ["/", "/dashboard", "/settings"];
  const protectedPrefixes = ["/admin"];
  const isProtected =
    protectedPaths.includes(pathname) ||
    protectedPrefixes.some((p) => pathname.startsWith(p));

  if (isProtected) {
    // Dev auth bypass — skip Supabase check (double-gated)
    if (
      isDevAuthEnabled() &&
      request.cookies.get(DEV_AUTH_COOKIE)?.value === "true"
    ) {
      return NextResponse.next();
    }

    const response = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      getSupabasePublicKey()!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const result = await supabase.auth.getUser();
    const user = result.data?.user;

    if (!user) {
      return NextResponse.redirect(new URL("/gallery", request.url));
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    // Exclude specific paths that don't need rate limiting
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
