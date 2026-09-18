/**
 * GET /api/gallery — the public gallery feed, grouped into image sets so a
 * chained project shows up with its parent.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { groupByParentChild } from "@/lib/gallery-utils";
import { handleRouteError, json } from "@/lib/server/http";
import { listGallery } from "@/lib/server/project-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit")) || 24, 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
    const tag = searchParams.get("tag");

    const projects = await listGallery({ limit, offset, sort: "newest", tag });
    return json(groupByParentChild(projects), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" },
    });
  } catch (error) {
    return handleRouteError(error, "Failed to load gallery");
  }
}
