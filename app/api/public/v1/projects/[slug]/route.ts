import { NextRequest } from "next/server";
import { getPublicProjectBySlug } from "@/lib/db/public-projects";
import { apiError } from "@/lib/api-error";
import { publicJson, publicNotFound, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/projects/{slug} — full public project.
 *
 * Visibility: only returns projects where published=true AND in_gallery=true.
 * Unknown / unpublished slugs return 404 with no info leak.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const project = await getPublicProjectBySlug(slug);
    if (!project) return publicNotFound();
    return publicJson(project);
  } catch (err) {
    return apiError(err, "Failed to load project");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
