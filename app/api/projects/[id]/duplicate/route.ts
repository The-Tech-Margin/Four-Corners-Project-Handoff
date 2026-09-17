/**
 * POST /api/projects/[id]/duplicate — copy a project, media included.
 *
 * The copy owns its media: blobs are copied into the caller's namespace and
 * counted against their quota, so it never depends on the original.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { DuplicateSchema } from "@/lib/api-contract/projects";
import {
  assertSameOrigin,
  errorResponse,
  handleRouteError,
  json,
  unauthorized,
} from "@/lib/server/http";
import { duplicateProject } from "@/lib/server/project-service";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = DuplicateSchema.safeParse(body ?? {});
    if (!parsed.success) return errorResponse("Invalid copy request", 400);

    const project = await duplicateProject(user, id, {
      slug: parsed.data.slug ?? null,
      title: parsed.data.title ?? null,
    });
    return json({ project }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to copy the project");
  }
}
