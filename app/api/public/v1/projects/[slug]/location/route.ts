import { NextRequest } from "next/server";
import { getPublicProjectBySlug } from "@/lib/server/public-projects";
import { apiError } from "@/lib/api-error";
import { publicJson, publicNotFound, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/projects/{slug}/location — geographic location.
 * Includes lat/lon, place names, and structured address when present.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const project = await getPublicProjectBySlug(slug);
    if (!project) return publicNotFound();

    return publicJson(project.metadata.location ?? null);
  } catch (err) {
    return apiError(err, "Failed to load location");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
