/**
 * POST /api/projects/[id]/children — promote a context image into its own
 * project, chained to this one.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { ProjectCreateSchema } from "@/lib/api-contract/projects";
import type { MainImageRef } from "@/lib/projects/types";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import {
  assertSameOrigin,
  errorResponse,
  handleRouteError,
  json,
  unauthorized,
} from "@/lib/server/http";
import { createProject, getForViewer } from "@/lib/server/project-service";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const parent = await getForViewer(id, user);
    if (!parent) return errorResponse("Parent project not found", 404);
    if (parent.user_id !== user.id) return errorResponse("Not your project", 403);

    const parsed = ProjectCreateSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Invalid project payload", 400);

    const { project, warnings } = await createProject(user, {
      metadata: parsed.data.metadata as FourCornersMetadataExtended,
      mainImage: (parsed.data.mainImage ?? null) as MainImageRef,
      slug: parsed.data.slug ?? null,
      title: parsed.data.title ?? null,
      tags: parsed.data.tags,
      parentProjectId: id,
      publishToGallery: parsed.data.publishToGallery ?? true,
    });

    return json({ project, warnings }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create the linked project");
  }
}
