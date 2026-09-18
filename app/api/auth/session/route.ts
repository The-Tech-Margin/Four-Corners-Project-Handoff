/**
 * GET /api/auth/session — who the browser is signed in as.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { SessionResponse } from "@/lib/api-contract/auth";
import { handleRouteError, json } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getServerUser();
    const body: SessionResponse = {
      user: user ? { id: user.id, email: user.email } : null,
    };
    return json(body);
  } catch (error) {
    return handleRouteError(error, "Failed to read the session");
  }
}
