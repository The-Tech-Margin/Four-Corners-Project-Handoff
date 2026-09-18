/**
 * GET /api/storage/quota — how much of this account's storage is used.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { handleRouteError, json, unauthorized } from "@/lib/server/http";
import { getQuota } from "@/lib/server/quota";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getServerUser();
    if (!user) return unauthorized();
    return json(await getQuota(user.id));
  } catch (error) {
    return handleRouteError(error, "Failed to read storage usage");
  }
}
