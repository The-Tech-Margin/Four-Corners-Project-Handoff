/**
 * DELETE /api/assets/[id] — remove one library asset and its bytes.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import {
  assertSameOrigin,
  errorResponse,
  handleRouteError,
  json,
  unauthorized,
} from "@/lib/server/http";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const removed = await getServices().assets.delete(user.id, id);
    if (!removed) return errorResponse("Asset not found", 404);

    const keys = [removed.key, removed.thumbnailKey].filter((key): key is string => !!key);
    await getServices().blobs.delete(removed.bucket, keys);

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete the asset");
  }
}
