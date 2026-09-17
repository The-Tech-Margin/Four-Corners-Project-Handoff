import { NextRequest } from "next/server";
import { getPublicProjectBySlug, getPublicProjectChildren } from "@/lib/db/public-projects";
import { apiError } from "@/lib/api-error";
import { publicJson, publicNotFound, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/projects/{slug}/children — daisy-chained child projects.
 *
 * Returns child projects whose parent_project_id matches this project, filtered
 * to published+in_gallery only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const parent = await getPublicProjectBySlug(slug);
    if (!parent) return publicNotFound();

    const children = await getPublicProjectChildren(parent.id);
    return publicJson({
      data: children,
      meta: { limit: children.length, offset: 0, count: children.length },
    });
  } catch (err) {
    return apiError(err, "Failed to load project children");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
