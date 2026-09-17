/**
 * POST /api/auth/sign-in
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import { CredentialsSchema } from "@/lib/api-contract/auth";
import { applyCookies, assertSameOrigin, errorResponse, handleRouteError, json } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const parsed = CredentialsSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Enter an email and password", 400);

    const result = await getServices().auth.signIn(parsed.data);
    if (!result.ok) return errorResponse(result.message, 401, result.code);

    return applyCookies(
      json({ user: { id: result.user.id, email: result.user.email } }),
      result.cookies,
    );
  } catch (error) {
    return handleRouteError(error, "Sign in failed");
  }
}
