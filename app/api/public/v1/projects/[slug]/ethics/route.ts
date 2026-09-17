import { NextRequest } from "next/server";
import { getPublicProjectBySlug } from "@/lib/db/public-projects";
import { apiError } from "@/lib/api-error";
import { publicJson, publicNotFound, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/projects/{slug}/ethics — Bottom-Right corner.
 *
 * The BR corner bundles three normalized tables (creative_commons, ethics,
 * photographer_info) since they share the corner per TYPES.md.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const project = await getPublicProjectBySlug(slug);
    if (!project) return publicNotFound();

    return publicJson({
      creativeCommons: project.metadata.creativeCommons ?? null,
      ethics: project.metadata.ethics ?? null,
      photographerInfo: project.metadata.photographerInfo ?? null,
    });
  } catch (err) {
    return apiError(err, "Failed to load ethics");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
