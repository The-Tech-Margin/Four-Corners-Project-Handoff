import { NextRequest } from "next/server";
import { getPublicProjectBySlug } from "@/lib/server/public-projects";
import { apiError } from "@/lib/api-error";
import { publicJson, publicNotFound, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/projects/{slug}/backstory — Bottom-Left corner.
 * Returns the photographer's narrative + publication context.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const project = await getPublicProjectBySlug(slug);
    if (!project) return publicNotFound();

    return publicJson(project.metadata.backStory ?? {});
  } catch (err) {
    return apiError(err, "Failed to load backstory");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
