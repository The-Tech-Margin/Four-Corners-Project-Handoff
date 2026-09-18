/**
 * GET /api/gallery/adjacent?id= — the gallery neighbours of a project, for
 * previous/next navigation in the viewer.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { errorResponse, handleRouteError, json } from "@/lib/server/http";
import { listGallery } from "@/lib/server/project-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return errorResponse("id is required", 400);

    const feed = await listGallery({ limit: 500, offset: 0, sort: "newest" });
    const roots = feed.filter((project) => !project.parent_project_id);
    const index = roots.findIndex((project) => project.id === id);

    const summary = (position: number) => {
      const project = roots[position];
      if (!project) return null;
      return {
        id: project.id,
        slug: project.slug ?? null,
        title: project.title ?? null,
        thumbnailUrl: project.main_image_thumbnail_url ?? project.main_image_url ?? null,
      };
    };

    return json({
      prev: index > 0 ? summary(index - 1) : null,
      next: index >= 0 ? summary(index + 1) : null,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to load gallery neighbours");
  }
}
