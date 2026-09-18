import { NextResponse } from "next/server";

/**
 * Standardized API error response from an unknown catch value.
 */
export function apiError(
  error: unknown,
  fallback: string,
  status = 500,
): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  console.error(fallback, error);
  return NextResponse.json({ error: message }, { status });
}
