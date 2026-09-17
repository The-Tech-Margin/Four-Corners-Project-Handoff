import { NextRequest } from "next/server";
import { getPublicProjectBySlug } from "@/lib/db/public-projects";
import { generateIIIFManifest } from "@/lib/exportIIIF";
import { apiError } from "@/lib/api-error";
import { publicJson, publicNotFound, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/projects/{slug}/iiif — IIIF Presentation 3.0 manifest.
 *
 * Generated via the shared lib/exportIIIF.ts builder so the manifest stays in
 * sync with the in-app "Download IIIF" button.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const project = await getPublicProjectBySlug(slug);
    if (!project) return publicNotFound();

    const filename =
      project.main_image_url?.split("/").pop()?.split("?")[0] || `${slug}.jpg`;
    const manifestId = `${request.nextUrl.origin}/api/public/v1/projects/${slug}/iiif`;

    const manifest = generateIIIFManifest(project.metadata, filename, manifestId);
    return publicJson(manifest);
  } catch (err) {
    return apiError(err, "Failed to build IIIF manifest");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
