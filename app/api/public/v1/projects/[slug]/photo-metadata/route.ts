import { NextRequest } from "next/server";
import { getPublicProjectBySlug } from "@/lib/db/public-projects";
import { apiError } from "@/lib/api-error";
import { publicJson, publicNotFound, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/projects/{slug}/photo-metadata — EXIF / camera metadata.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const project = await getPublicProjectBySlug(slug);
    if (!project) return publicNotFound();

    return publicJson(project.metadata.photoMetadata ?? null);
  } catch (err) {
    return apiError(err, "Failed to load photo metadata");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
