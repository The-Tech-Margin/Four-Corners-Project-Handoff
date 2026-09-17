/**
 * Dev-only auth bypass endpoint.
 * POST → set dev auth cookie (login)
 * DELETE → remove dev auth cookie (logout)
 */
import { NextResponse } from "next/server";
import { DEV_AUTH_COOKIE, DEV_USER, isDevAuthEnabled } from "@/lib/dev-auth";

export async function POST() {
  if (!isDevAuthEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const res = NextResponse.json({ user: DEV_USER, ok: true });
  res.cookies.set(DEV_AUTH_COOKIE, "true", {
    path: "/",
    httpOnly: false, // readable by client JS
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}

export async function DELETE() {
  if (!isDevAuthEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(DEV_AUTH_COOKIE);
  return res;
}
