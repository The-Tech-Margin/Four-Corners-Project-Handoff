/**
 * GET  /api/admin/invites — list pending + recent invites.
 * POST /api/admin/invites — actions: approve | deny | revoke | resend | create.
 *
 * Same admin gating as /api/admin/users (verifyAdminSession OR isCurrentUserAdmin).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin } from "@/lib/admin-roles";
import {
  findActiveInviteByEmail,
  getInviteById,
  getInviteServiceClient,
  isExistingAuthUser,
  type InviteRow,
} from "@/lib/invites/db";
import {
  generateInviteToken,
  inviteTokenExpiresAt,
} from "@/lib/invites/tokens";
import { sendEmail } from "@/lib/email/resend";
import {
  inviteApprovedEmail,
  inviteDeniedEmail,
} from "@/lib/email/templates";
import { apiError } from "@/lib/api-error";

async function gate(): Promise<NextResponse | null> {
  const [hasPasswordSession, hasDbRole] = await Promise.all([
    verifyAdminSession(),
    isCurrentUserAdmin(),
  ]);
  if (!hasPasswordSession && !hasDbRole) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const denied = await gate();
  if (denied) return denied;

  const sb = getInviteServiceClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Service not configured" },
      { status: 503 },
    );
  }

  try {
    const { data, error } = await sb
      .from("user_invites")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    return NextResponse.json({ invites: data ?? [] });
  } catch (err) {
    return apiError(err, "Failed to list invites");
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), id: z.string().uuid() }),
  z.object({ action: z.literal("deny"), id: z.string().uuid() }),
  z.object({ action: z.literal("revoke"), id: z.string().uuid() }),
  z.object({ action: z.literal("resend"), id: z.string().uuid() }),
  z.object({
    action: z.literal("create"),
    email: z.string().email().max(254),
    full_name: z.string().trim().min(1).max(120),
    organization: z.string().trim().max(160).optional().nullable(),
  }),
]);

export async function POST(request: NextRequest) {
  const denied = await gate();
  if (denied) return denied;

  const sb = getInviteServiceClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Service not configured" },
      { status: 503 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    const json = await request.json();
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Acting admin id + display name (for reviewed_by / created_by /
  // reviewed_by_name). Name is snapshotted at action time so the card can
  // render "Reviewed by …" without a join, and the historical attribution
  // survives later profile renames.
  const supabase = await createServerClient();
  const {
    data: { user: actingUser },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const adminId = actingUser?.id ?? null;
  const adminMeta = (actingUser?.user_metadata ?? {}) as {
    full_name?: string | null;
    name?: string | null;
  };
  const adminName =
    adminMeta.full_name ?? adminMeta.name ?? actingUser?.email ?? null;

  try {
    if (body.action === "create") {
      const email = body.email.toLowerCase();
      if (await isExistingAuthUser(email)) {
        return NextResponse.json(
          { error: "That email already has an account." },
          { status: 409 },
        );
      }
      const existing = await findActiveInviteByEmail(email);
      if (existing) {
        return NextResponse.json(
          { error: "There's already an active invite for that email." },
          { status: 409 },
        );
      }
      const token = generateInviteToken();
      const expiresAt = inviteTokenExpiresAt();
      const { data, error } = await sb
        .from("user_invites")
        .insert({
          email,
          full_name: body.full_name,
          organization: body.organization ?? null,
          status: "approved",
          invite_token: token,
          token_expires_at: expiresAt,
          created_by: adminId,
          reviewed_by: adminId,
          reviewed_by_name: adminName,
          reviewed_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      const emailResult = await sendInviteApproved(
        data as InviteRow,
        token,
        request,
      );
      return NextResponse.json({
        ok: true,
        invite: data,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
      });
    }

    // All other actions operate on an existing row.
    const target = await getInviteById(body.id);
    if (!target) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (body.action === "approve") {
      if (target.status !== "pending") {
        return NextResponse.json(
          { error: `Cannot approve a ${target.status} invite.` },
          { status: 409 },
        );
      }
      const token = generateInviteToken();
      const expiresAt = inviteTokenExpiresAt();
      const { data, error } = await sb
        .from("user_invites")
        .update({
          status: "approved",
          invite_token: token,
          token_expires_at: expiresAt,
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
          reviewed_by_name: adminName,
        })
        .eq("id", target.id)
        .select("*")
        .single();
      if (error) throw error;
      const emailResult = await sendInviteApproved(
        data as InviteRow,
        token,
        request,
      );
      return NextResponse.json({
        ok: true,
        invite: data,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
      });
    }

    if (body.action === "deny") {
      if (target.status !== "pending") {
        return NextResponse.json(
          { error: `Cannot deny a ${target.status} invite.` },
          { status: 409 },
        );
      }
      const { data, error } = await sb
        .from("user_invites")
        .update({
          status: "denied",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
          reviewed_by_name: adminName,
        })
        .eq("id", target.id)
        .select("*")
        .single();
      if (error) throw error;
      const { subject, html } = inviteDeniedEmail({
        fullName: target.full_name,
      });
      void sendEmail({ to: target.email, subject, html });
      return NextResponse.json({ ok: true, invite: data });
    }

    if (body.action === "revoke") {
      if (target.status === "accepted") {
        return NextResponse.json(
          { error: "Cannot revoke an accepted invite — ban the user instead." },
          { status: 409 },
        );
      }
      const { data, error } = await sb
        .from("user_invites")
        .update({
          status: "revoked",
          invite_token: null,
          token_expires_at: null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
          reviewed_by_name: adminName,
        })
        .eq("id", target.id)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, invite: data });
    }

    if (body.action === "resend") {
      if (target.status !== "approved") {
        return NextResponse.json(
          { error: "Only approved invites can be resent." },
          { status: 409 },
        );
      }
      // Refresh the token + expiry; the old link goes dead.
      const token = generateInviteToken();
      const expiresAt = inviteTokenExpiresAt();
      const { data, error } = await sb
        .from("user_invites")
        .update({
          invite_token: token,
          token_expires_at: expiresAt,
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
          reviewed_by_name: adminName,
        })
        .eq("id", target.id)
        .select("*")
        .single();
      if (error) throw error;
      const emailResult = await sendInviteApproved(
        data as InviteRow,
        token,
        request,
      );
      return NextResponse.json({
        ok: true,
        invite: data,
        emailSent: emailResult.ok,
        emailError: emailResult.error,
      });
    }

    return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
  } catch (err) {
    return apiError(err, "Failed to update invite");
  }
}

async function sendInviteApproved(
  row: InviteRow,
  token: string,
  request: NextRequest,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const acceptUrl = `${origin}/auth/accept-invite?token=${encodeURIComponent(
    token,
  )}`;
  const { subject, html } = inviteApprovedEmail({
    fullName: row.full_name,
    acceptUrl,
  });
  const result = await sendEmail({ to: row.email, subject, html });

  // Visible breadcrumb in Vercel logs. Every approve/resend/create that gets
  // here logs exactly one line, so it's easy to tell at a glance whether the
  // failure is in our DB write, the Resend transport, or downstream delivery.
  if (result.ok) {
    console.log(
      `[invites] sent approval email to ${row.email} id=${result.id ?? "?"}`,
    );
  } else {
    console.error(
      `[invites] FAILED to send approval email to ${row.email}: ${
        result.error ?? "unknown"
      }`,
    );
  }
  return result;
}
