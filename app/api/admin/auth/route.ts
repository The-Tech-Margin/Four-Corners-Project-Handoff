/**
 * Admin auth — session check + password login.
 * Supports dual auth: ADMIN_PASSWORD cookie OR Supabase admin role.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isAdminConfigured,
  verifyPassword,
  setAdminSession,
  verifyAdminSession,
} from "@/lib/admin-auth";
import {
  isCurrentUserAdmin,
  currentUserHighestRole,
} from "@/lib/admin-roles";
import { getInviteServiceClient } from "@/lib/invites/db";

export async function GET() {
  const passwordConfigured = isAdminConfigured();
  const hasPasswordSession = await verifyAdminSession();
  const hasDbRole = await isCurrentUserAdmin();
  const role = hasDbRole ? await currentUserHighestRole() : null;
  const authenticated = hasPasswordSession || hasDbRole;

  // Pending-invite count for the nav badge. Fail-soft on every failure
  // mode (no client, missing table, RLS) — the count is purely cosmetic
  // and must never block the auth check.
  let pendingInvites = 0;
  if (authenticated) {
    try {
      const sb = getInviteServiceClient();
      if (sb) {
        const { count, error } = await sb
          .from("user_invites")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending");
        if (!error && typeof count === "number") {
          pendingInvites = count;
        }
      }
    } catch {
      // swallow — see comment above
    }
  }

  return NextResponse.json({
    configured: passwordConfigured || hasDbRole,
    authenticated,
    method: hasDbRole ? "role" : hasPasswordSession ? "password" : null,
    role,
    pendingInvites,
  });
}

export async function POST(req: NextRequest) {
  // If user already has DB admin role, just confirm
  const hasDbRole = await isCurrentUserAdmin();
  if (hasDbRole) {
    return NextResponse.json({ authenticated: true, method: "role" });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Admin is not configured" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.password || typeof body.password !== "string") {
    return NextResponse.json(
      { error: "Password required" },
      { status: 400 },
    );
  }

  if (!verifyPassword(body.password)) {
    return NextResponse.json(
      { error: "Invalid password" },
      { status: 401 },
    );
  }

  await setAdminSession();
  return NextResponse.json({ authenticated: true, method: "password" });
}
