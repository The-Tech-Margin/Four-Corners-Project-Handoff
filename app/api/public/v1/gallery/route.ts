import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type GalleryFeedRow,
  GALLERY_FEED_SELECT,
  buildGalleryFeedRecord,
} from "@/lib/db/projects-transforms";
import { groupByParentChild } from "@/lib/gallery-utils";
import { apiError } from "@/lib/api-error";
import { publicHeaders, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/gallery — paginated public gallery feed.
 *
 * Reads from the `gallery_feed` Postgres view (single query plan, server-side
 * filtering by published+in_gallery) and groups by parent/child to match the
 * existing /api/gallery response shape.
 *
 * Query params: limit (1–100, default 24), offset (default 0),
 * sort = newest | oldest | random, tag (optional).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 24, 1), 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
    const sortRaw = searchParams.get("sort") ?? "newest";
    const sort: "newest" | "oldest" | "random" =
      sortRaw === "oldest" || sortRaw === "random" ? sortRaw : "newest";
    const tag = searchParams.get("tag");

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const stripCol = (s: string, col: string) =>
      s.replace(`,${col}`, "").replace(`${col},`, "").replace(col, "");

    let select = GALLERY_FEED_SELECT;

    const run = async (sel: string) => {
      let q = supabase.from("gallery_feed").select(sel);
      if (tag) q = q.contains("tags", [tag]);

      if (sort === "newest") q = q.order("created_at", { ascending: false });
      else if (sort === "oldest") q = q.order("created_at", { ascending: true });
      // For "random" we still order by created_at then shuffle client-side
      // within the page; full-table random sampling needs a different query.
      else q = q.order("created_at", { ascending: false });

      return q.range(offset, offset + limit - 1);
    };

    let result = await run(select);

    if (result.error?.message?.includes("main_image_thumbnail_path")) {
      select = stripCol(select, "main_image_thumbnail_path");
      result = await run(select);
    }
    if (result.error?.message?.includes("tags")) {
      select = stripCol(select, "tags");
      result = await run(select);
    }

    if (result.error) {
      console.error("Public gallery query failed:", result.error.message);
      return NextResponse.json({ error: "Failed to load gallery" }, { status: 500 });
    }

    const projects = ((result.data as GalleryFeedRow[]) || []).map(buildGalleryFeedRecord);
    let sets = groupByParentChild(projects);

    if (sort === "random") {
      sets = [...sets].sort(() => Math.random() - 0.5);
    }

    return new NextResponse(
      JSON.stringify({
        data: sets,
        meta: { limit, offset, count: sets.length, sort, tag: tag ?? null },
      }),
      { headers: publicHeaders() },
    );
  } catch (err) {
    return apiError(err, "Failed to load gallery");
  }
}

export async function OPTIONS() {
  return publicOptions();
}
