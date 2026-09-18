/**
 * POST /api/auth/password/forgot — send a reset link.
 *
 * The response is the same whether or not the address has an account, so it
 * cannot be used to discover who has one.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import { ForgotPasswordSchema } from "@/lib/api-contract/auth";
import { siteUrl } from "@/lib/attribution";
import { assertSameOrigin, errorResponse, handleRouteError, json } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const parsed = ForgotPasswordSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Enter your email address", 400);

    const origin = request.nextUrl.origin || siteUrl();
    await getServices().auth.requestPasswordReset(parsed.data.email, {
      resetUrl: (token) => `${origin}/auth/reset-password?token=${encodeURIComponent(token)}`,
    });

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Could not start a password reset");
  }
}
