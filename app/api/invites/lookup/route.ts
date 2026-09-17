/**
 * GET /api/invites/lookup?token=... — public token validator.
 *
 * Returns the email/name/org tied to a token without exposing the rest of
 * the invite row, so the accept-invite page can prefill its display fields
 * before the user submits a password.
 */

import { NextRequest, NextResponse } from "next/server";
import { getInviteByToken } from "@/lib/invites/db";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const invite = await getInviteByToken(token);
  if (!invite) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }
  if (invite.status === "accepted") {
    return NextResponse.json(
      { error: "This invite has already been used." },
      { status: 410 },
    );
  }
  if (invite.status !== "approved") {
    return NextResponse.json(
      { error: "This invite is no longer valid." },
      { status: 410 },
    );
  }
  if (
    invite.token_expires_at &&
    new Date(invite.token_expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json(
      { error: "This invite has expired." },
      { status: 410 },
    );
  }

  return NextResponse.json({
    email: invite.email,
    full_name: invite.full_name,
    organization: invite.organization,
  });
}
