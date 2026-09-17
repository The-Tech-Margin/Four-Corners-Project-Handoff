import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type GalleryFeedRow,
  GALLERY_FEED_SELECT,
  buildGalleryFeedRecord,
} from "@/lib/db/projects-transforms";
import { groupByParentChild } from "@/lib/gallery-utils";
import { apiError } from "@/lib/api-error";
import {
  galleryCache as cache,
  GALLERY_CACHE_TTL_MS as CACHE_TTL_MS,
  getGalleryCacheKey as getCacheKey,
} from "@/lib/gallery-cache";

/**
 * GET /api/gallery — Public gallery feed.
 *
 * Reads from the `gallery_feed` Postgres view which does all JOINs in a
 * single query plan (vs PostgREST issuing 6+ separate queries).
 *
 * Cache layers (invalidated on gallery toggle via /api/gallery/invalidate):
 *   1. In-memory (this isolate): 60 s
 *   2. CDN (s-maxage): 60 s
 *   3. Browser (stale-while-revalidate): 60 s
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit")) || 24, 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const cacheKey = getCacheKey(limit, offset);
    const cached = cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return new NextResponse(cached.data, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
          "X-Cache": "HIT",
          "Server-Timing": "cache;desc=memory;dur=0",
        },
      });
    }

    const dbStart = performance.now();
    const supabase = await createClient();

    // Try with tags column first; fall back without if migration 026 hasn't run
    let data: GalleryFeedRow[] | null = null;
    let error: { message: string } | null = null;

    // Optional columns added by recent migrations — strip and retry on
    // "undefined column" errors so the route works against any DB state.
    const stripCol = (s: string, col: string) =>
      s.replace(`,${col}`, "").replace(`${col},`, "").replace(col, "");

    let select = GALLERY_FEED_SELECT;
    let result = await supabase
      .from("gallery_feed")
      .select(select)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (result.error?.message?.includes("main_image_thumbnail_path")) {
      select = stripCol(select, "main_image_thumbnail_path");
      result = await supabase
        .from("gallery_feed")
        .select(select)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    }

    if (result.error?.message?.includes("tags")) {
      select = stripCol(select, "tags");
      result = await supabase
        .from("gallery_feed")
        .select(select)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    }

    data = result.data as GalleryFeedRow[] | null;
    error = result.error;

    const dbMs = Math.round(performance.now() - dbStart);

    if (error) {
      console.error("Gallery query failed:", error.message);
      return NextResponse.json(
        { error: "Failed to load gallery" },
        { status: 500 },
      );
    }

    const projects = (data as GalleryFeedRow[] || []).map(buildGalleryFeedRecord);
    const sets = groupByParentChild(projects);

    const json = JSON.stringify(sets);

    cache.set(cacheKey, { data: json, expiresAt: Date.now() + CACHE_TTL_MS });

    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
        "X-Cache": "MISS",
        "Server-Timing": `db;dur=${dbMs}`,
      },
    });
  } catch (err) {
    return apiError(err, "Failed to load gallery");
  }
}
