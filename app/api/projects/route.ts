/**
 * GET  /api/projects — the caller's projects (listing shape).
 * POST /api/projects — create a project from a metadata document.
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
import { createProject, listForOwner } from "@/lib/server/project-service";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const projects = await listForOwner(user.id, { limit, offset });
    return json({ projects }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    return handleRouteError(error, "Failed to load projects");
  }
}

export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const parsed = ProjectCreateSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Invalid project payload", 400);

    const { project, warnings } = await createProject(user, {
      metadata: parsed.data.metadata as FourCornersMetadataExtended,
      mainImage: (parsed.data.mainImage ?? null) as MainImageRef,
      slug: parsed.data.slug ?? null,
      title: parsed.data.title ?? null,
      tags: parsed.data.tags,
      parentProjectId: parsed.data.parentProjectId ?? null,
      publishToGallery: parsed.data.publishToGallery,
    });

    return json({ project, warnings }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create the project");
  }
}
