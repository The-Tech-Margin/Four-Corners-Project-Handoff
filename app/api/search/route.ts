/**
 * GET /api/search?q= — search the public gallery.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import { toListingRecord } from "@/lib/projects/projections";
import { handleRouteError, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const query = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 24, 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    if (!query) return json({ projects: [], semantic: false });

    const search = getServices().search;
    const docs = await search.searchGallery({ query, limit, offset });
    return json({
      projects: docs.map(toListingRecord),
      semantic: search.capabilities.semantic,
    });
  } catch (error) {
    return handleRouteError(error, "Search failed");
  }
}
