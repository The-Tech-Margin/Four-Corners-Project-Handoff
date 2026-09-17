/**
 * PUT /api/projects/[id]/visibility — publish, share by link, or list in
 * the gallery. The rules live in lib/projects/rules.ts.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { VisibilitySchema } from "@/lib/api-contract/projects";
import {
  assertSameOrigin,
  errorResponse,
  handleRouteError,
  json,
  unauthorized,
} from "@/lib/server/http";
import { setVisibility } from "@/lib/server/project-service";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const parsed = VisibilitySchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Set published, inGallery, or both", 400);

    return json({ project: await setVisibility(user, id, parsed.data) });
  } catch (error) {
    return handleRouteError(error, "Failed to update visibility");
  }
}
