/**
 * GET    /api/projects/[id] — one project, by id or slug.
 * PUT    /api/projects/[id] — save the whole metadata document.
 * PATCH  /api/projects/[id] — rename, re-slug or re-tag.
 * DELETE /api/projects/[id]
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { ProjectPatchSchema, ProjectSaveSchema } from "@/lib/api-contract/projects";
import type { MainImageRef } from "@/lib/projects/types";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import {
  assertSameOrigin,
  errorResponse,
  handleRouteError,
  json,
  unauthorized,
} from "@/lib/server/http";
import {
  deleteProject,
  getForViewer,
  patchProject,
  saveProject,
} from "@/lib/server/project-service";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const viewer = await getServerUser();
    const project = await getForViewer(id, viewer);
    if (!project) return errorResponse("Project not found", 404);

    return json({
      project,
      viewer: {
        isOwner: project.user_id === viewer?.id,
        isAuthenticated: !!viewer,
      },
    });
  } catch (error) {
    return handleRouteError(error, "Failed to load the project");
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const parsed = ProjectSaveSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Invalid project payload", 400);

    const { project, warnings } = await saveProject(user, id, {
      metadata: parsed.data.metadata as FourCornersMetadataExtended,
      mainImage: parsed.data.mainImage as MainImageRef | undefined,
      slug: parsed.data.slug,
      title: parsed.data.title,
      tags: parsed.data.tags,
    });

    return json({ project, warnings });
  } catch (error) {
    return handleRouteError(error, "Failed to save the project");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const parsed = ProjectPatchSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Invalid project update", 400);

    return json({ project: await patchProject(user, id, parsed.data) });
  } catch (error) {
    return handleRouteError(error, "Failed to update the project");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const removed = await deleteProject(user, id);
    if (!removed) return errorResponse("Project not found", 404);
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete the project");
  }
}
