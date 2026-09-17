/**
 * Request proxy (Next 16's middleware file).
 *
 *  1. Rate-limits /api/* by tier, identifying the caller by verified session
 *     cookie where there is one, otherwise by IP. The public API's optional
 *     Bearer key unlocks the higher tier.
 *  2. Sends signed-out visitors from the editor and dashboard to the gallery.
 *
 * It never touches the data store: Next runs this file in its own module
 * graph, and a page gate does not need one.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextResponse, type NextRequest } from "next/server";
import { peekSessionUserId } from "@/lib/adapters/proxy-runtime";
import { SESSION_COOKIE } from "@/lib/ports/auth";
import {
  checkRateLimit,
  classifyRoute,
  extractIdentifier,
  RATE_LIMIT_TIERS,
  resolvePublicApiRateLimit,
  type RateLimitTier,
} from "@/lib/rate-limit";

async function applyRateLimit(
  identifier: string,
  tier: RateLimitTier,
  pathname: string,
  method: string,
): Promise<NextResponse> {
  const result = await checkRateLimit(identifier, tier, pathname, method);

  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
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

  if (pathname.startsWith("/api/")) {
    // The gallery feed is public, read-only and cached — skip the counter.
    if (pathname === "/api/gallery") return NextResponse.next();

    if (pathname.startsWith("/api/public/")) {
      const { tier, identifier } = await resolvePublicApiRateLimit(request);
      return applyRateLimit(identifier, tier, pathname, method);
    }

    const tier = classifyRoute(pathname, method);
    if (tier) {
      const identifier = await extractIdentifier(
        request,
        RATE_LIMIT_TIERS[tier].identifierType,
      );
      if (identifier) return applyRateLimit(identifier, tier, pathname, method);
    }

    return NextResponse.next();
  }

  const protectedPaths = ["/", "/dashboard"];
  // A share link lands on "/" with a file to open, and the viewer may be
  // signed out — that is the point of a share link.
  const isSharedLink =
    pathname === "/" &&
    (request.nextUrl.searchParams.has("file") || request.nextUrl.searchParams.has("project"));

  if (protectedPaths.includes(pathname) && !isSharedLink) {
    const signedIn = peekSessionUserId(request.cookies.get(SESSION_COOKIE)?.value);
    if (!signedIn) return NextResponse.redirect(new URL("/gallery", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - uploads and transcription (Next buffers a proxied body at 10 MB,
     *    which would truncate a large image, video or recording),
     *  - the blob route, which is hot and already checks access itself,
     *  - static assets.
     */
    "/((?!api/storage/upload|api/ai/transcribe|api/blobs|_next/static|_next/image|favicon.ico).*)",
  ],
};
