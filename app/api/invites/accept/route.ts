/**
 * POST /api/invites/accept — finalize an invite.
 *
 * Verifies the token, creates the auth user via service-role, inserts the
 * matching user_profiles row, and flips the invite status to 'accepted'.
 * The client then performs `signInWithPassword` to establish a session.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getInviteByToken, getInviteServiceClient } from "@/lib/invites/db";
import { apiError } from "@/lib/api-error";

const Body = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    const { token, password } = parsed.data;

    const sb = getInviteServiceClient();
    if (!sb) {
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 503 },
      );
    }

    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json(
        { error: "This invite link is invalid." },
        { status: 404 },
      );
    }
    if (invite.status !== "approved") {
      return NextResponse.json(
        {
          error:
            invite.status === "accepted"
              ? "This invite has already been used. Sign in instead."
              : "This invite link is no longer valid.",
        },
        { status: 410 },
      );
    }
    if (
      invite.token_expires_at &&
      new Date(invite.token_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        {
          error:
            "This invite link has expired. Ask the team to send a new one.",
        },
        { status: 410 },
      );
    }

    // Create the auth user (email confirmed — they verified ownership by
    // clicking a token that only landed in their inbox).
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: {
        has_password: true,
        full_name: invite.full_name,
      },
    });
    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create account" },
        { status: 500 },
      );
    }

    const userId = created.user.id;

    // Insert profile row. If somehow it already exists, update it.
    const { error: profileErr } = await sb
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          full_name: invite.full_name,
          organization: invite.organization,
        },
        { onConflict: "user_id" },
      );
    if (profileErr) {
      console.error("[invites] profile upsert failed:", profileErr.message);
    }

    // Mark invite accepted.
    const { error: updateErr } = await sb
      .from("user_invites")
      .update({
        status: "accepted",
        accepted_user_id: userId,
      })
      .eq("id", invite.id);
    if (updateErr) {
      console.error("[invites] mark accepted failed:", updateErr.message);
    }

    return NextResponse.json({
      ok: true,
      email: invite.email,
    });
  } catch (err) {
    return apiError(err, "Failed to accept invite");
  }
}
