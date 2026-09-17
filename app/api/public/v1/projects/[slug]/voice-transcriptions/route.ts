import { NextRequest } from "next/server";
import { getPublicProjectBySlug } from "@/lib/server/public-projects";
import { apiError } from "@/lib/api-error";
import { publicJson, publicNotFound, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/projects/{slug}/voice-transcriptions — voice recordings.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const project = await getPublicProjectBySlug(slug);
    if (!project) return publicNotFound();

    const items = project.metadata.voiceTranscriptions ?? [];
    return publicJson({
      data: items,
      meta: { limit: items.length, offset: 0, count: items.length },
    });
  } catch (err) {
    return apiError(err, "Failed to load voice transcriptions");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
