/**
 * POST /api/auth/password/reset — set a new password from a reset link.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import { ResetPasswordSchema } from "@/lib/api-contract/auth";
import { applyCookies, assertSameOrigin, errorResponse, handleRouteError, json } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const parsed = ResetPasswordSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("That reset link is not valid", 400);

    const result = await getServices().auth.consumePasswordReset(parsed.data);
    if (!result.ok) return errorResponse(result.message, 400, result.code);

    return applyCookies(
      json({ user: { id: result.user.id, email: result.user.email } }),
      result.cookies,
    );
  } catch (error) {
    return handleRouteError(error, "Could not reset the password");
  }
}
