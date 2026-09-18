/**
 * POST /api/auth/sign-out
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import { applyCookies, assertSameOrigin, handleRouteError, json } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const cookies = await getServices().auth.signOut();
    return applyCookies(json({ ok: true }), cookies);
  } catch (error) {
    return handleRouteError(error, "Sign out failed");
  }
}
