/**
 * Request and response helpers shared by the route handlers: one place that
 * turns a port error into a status code, and the same-origin check every
 * mutating route runs.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { NextResponse } from "next/server";
import type { CookieMutation } from "@/lib/ports/auth";
import {
  CapabilityUnavailableError,
  ConflictError,
  ForbiddenError,
  GalleryLimitError,
  NotConfiguredError,
  NotFoundError,
  PortError,
  QuotaExceededError,
} from "@/lib/ports/errors";

export function json<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init);
}

export function errorResponse(message: string, status: number, code?: string): NextResponse {
  return NextResponse.json(code ? { error: message, code } : { error: message }, { status });
}

export const unauthorized = (): NextResponse => errorResponse("Unauthorized", 401);

/** Map a thrown value to a response, without leaking internals to the client. */
export function handleRouteError(error: unknown, fallback: string): NextResponse {
  if (error instanceof NotConfiguredError) {
    console.error(fallback, error);
    return errorResponse(error.message, 501, error.code);
  }
  if (error instanceof CapabilityUnavailableError) {
    return errorResponse(error.message, 501, error.code);
  }
  if (error instanceof NotFoundError) return errorResponse(error.message, 404, error.code);
  if (error instanceof ForbiddenError) return errorResponse(error.message, 403, error.code);
  if (error instanceof ConflictError) return errorResponse(error.message, 409, error.code);
  if (error instanceof GalleryLimitError) return errorResponse(error.message, 409, error.code);
  if (error instanceof QuotaExceededError) {
    return NextResponse.json(
      { error: error.message, code: error.code, used: error.used, limit: error.limit },
      { status: 413 },
    );
  }
  if (error instanceof PortError) return errorResponse(error.message, 400, error.code);

  console.error(fallback, error);
  return errorResponse(fallback, 500);
}

export function applyCookies(response: NextResponse, cookies: CookieMutation[]): NextResponse {
  for (const cookie of cookies) {
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      maxAge: cookie.maxAge,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
      path: cookie.path,
    });
  }
  return response;
}

/**
 * Defence in depth behind SameSite cookies: a cross-site form post carries
 * an Origin header that will not match this host.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin navigations and server-side calls
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function assertSameOrigin(request: Request): NextResponse | null {
  return isSameOrigin(request) ? null : errorResponse("Cross-origin request refused", 403);
}
