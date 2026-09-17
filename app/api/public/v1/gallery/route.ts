/**
 * GET /api/public/v1/gallery — paginated public gallery feed.
 *
 * Query params: limit (1–100, default 24), offset (default 0),
 * sort = newest | oldest | random, tag (optional).
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api-error";
import { publicHeaders, publicOptions } from "@/lib/api-public-headers";
import { groupByParentChild } from "@/lib/gallery-utils";
import { listGallery } from "@/lib/server/project-service";
import { withAbsoluteMediaUrls } from "@/lib/projects/projections";
import { siteUrl } from "@/lib/attribution";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 24, 1), 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
    const sortRaw = searchParams.get("sort") ?? "newest";
    const sort: "newest" | "oldest" | "random" =
      sortRaw === "oldest" || sortRaw === "random" ? sortRaw : "newest";
    const tag = searchParams.get("tag");

    const projects = await listGallery({
      limit,
      offset,
      sort: sort === "oldest" ? "oldest" : "newest",
      tag,
    });

    // "random" shuffles within the requested page; sampling the whole
    // gallery is a different query and a different cost.
    const ordered = (
      sort === "random" ? projects.slice().sort(() => Math.random() - 0.5) : projects
    ).map((project) => withAbsoluteMediaUrls(project, siteUrl()));

    return NextResponse.json(
      { sets: groupByParentChild(ordered), limit, offset, sort, tag: tag ?? null },
      { headers: publicHeaders() },
    );
  } catch (err) {
    return apiError(err, "Failed to load gallery");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
