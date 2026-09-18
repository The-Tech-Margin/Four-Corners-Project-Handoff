/**
 * Shared response helpers for the public API (/api/public/v1).
 *
 * - CORS: open to any origin (read-only, public data).
 * - Cache-Control: 60s s-maxage / SWR to match the existing gallery feed.
 */

import { NextResponse } from "next/server";

export const PUBLIC_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=60";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function publicHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Cache-Control": PUBLIC_CACHE_CONTROL,
    ...CORS_HEADERS,
    ...(extra ?? {}),
  };
}

export function publicJson<T>(body: T, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: publicHeaders(init?.headers),
  });
}

export function publicNotFound() {
  return publicJson({ error: "Not found" }, { status: 404 });
}

export function publicOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS },
  });
}
