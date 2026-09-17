/**
 * POST /api/invites/request — public access-request endpoint.
 *
 * Idempotent + email-enumeration-resistant: returns the same generic
 * success response whether the email is new, already requested, or
 * already a user. Server-side log captures the true outcome.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  findActiveInviteByEmail,
  getInviteServiceClient,
  isExistingAuthUser,
} from "@/lib/invites/db";
import { sendEmail } from "@/lib/email/resend";
import {
  adminNewRequestEmail,
  inviteRequestReceivedEmail,
} from "@/lib/email/templates";
import { apiError } from "@/lib/api-error";

const RequestBody = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120),
  organization: z
    .string()
    .trim()
    .max(160)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  email: z.string().trim().toLowerCase().email("Invalid email").max(254),
});

const GENERIC_SUCCESS = {
  ok: true,
  message:
    "Thanks — we've received your request. If approved, you'll get an email with next steps.",
};

export async function POST(request: NextRequest) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = RequestBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    const { full_name, organization, email } = parsed.data;

    const sb = getInviteServiceClient();
    if (!sb) {
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 503 },
      );
    }

    // Already a user → still respond generically (no enumeration), log it.
    if (await isExistingAuthUser(email)) {
      console.log(`[invites] request from existing user: ${email}`);
      return NextResponse.json(GENERIC_SUCCESS);
    }

    // Active invite already → idempotent, no duplicate email sent.
    const existing = await findActiveInviteByEmail(email);
    if (existing) {
      console.log(
        `[invites] duplicate request (existing ${existing.status}): ${email}`,
      );
      return NextResponse.json(GENERIC_SUCCESS);
    }

    const { error } = await sb.from("user_invites").insert({
      email,
      full_name,
      organization,
      status: "pending",
    });
    if (error) {
      // Most likely the unique-active-email index — treat as duplicate.
      console.error("[invites] insert failed:", error.message);
      return NextResponse.json(GENERIC_SUCCESS);
    }

    // Send notifications (fail-soft).
    const requesterMsg = inviteRequestReceivedEmail({ fullName: full_name });
    void sendEmail({ to: email, ...requesterMsg });

    const adminTo = process.env.ADMIN_NOTIFY_EMAIL;
    if (adminTo) {
      const origin = new URL(request.url).origin;
      const adminMsg = adminNewRequestEmail({
        fullName: full_name,
        email,
        organization,
        adminUrl: `${origin}/admin/invites`,
      });
      void sendEmail({ to: adminTo, ...adminMsg });
    }

    return NextResponse.json(GENERIC_SUCCESS);
  } catch (err) {
    return apiError(err, "Failed to submit request");
  }
}
