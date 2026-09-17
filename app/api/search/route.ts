import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type GalleryFeedRow,
  buildGalleryFeedRecord,
} from "@/lib/db/projects-transforms";
import { groupByParentChild } from "@/lib/gallery-utils";
import { apiError } from "@/lib/api-error";
import { getAIGatewayKey, AI_GATEWAY_CONFIG } from "@/lib/ai-gateway";

/**
 * GET /api/search — Full-text search over published gallery projects.
 *
 * Uses PostgreSQL tsvector (weighted, ranked) via the
 * `search_gallery_projects` RPC function. Returns the same ImageSet[]
 * shape as /api/gallery so the gallery page can swap data sources
 * without changing rendering logic.
 *
 * When `semantic=true`, generates a query embedding and passes it to
 * the RPC for hybrid scoring (0.7 * tsvector rank + 0.3 * cosine sim).
 * Falls back to tsvector-only if embedding generation fails.
 *
 * Query params:
 *   q        — search query (required, 1-200 chars)
 *   limit    — max results (default 24, max 100)
 *   offset   — pagination offset (default 0)
 *   semantic — "true" to enable semantic re-ranking (default: off)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const query = (searchParams.get("q") || "").trim();

    if (!query || query.length > 200) {
      return NextResponse.json(
        { error: query ? "Query too long (max 200 chars)" : "Missing search query" },
        { status: 400 },
      );
    }

    const limit = Math.min(Number(searchParams.get("limit")) || 24, 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
    const semantic = searchParams.get("semantic") === "true";

    // Generate query embedding when semantic mode requested
    let queryEmbedding: string | null = null;
    if (semantic) {
      try {
        const apiKey = getAIGatewayKey();
        const embRes = await fetch("https://ai-gateway.vercel.sh/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: AI_GATEWAY_CONFIG.embeddingModel,
            input: query,
          }),
        });
        if (embRes.ok) {
          const embData = await embRes.json();
          const embedding = embData.data?.[0]?.embedding;
          if (Array.isArray(embedding)) {
            queryEmbedding = JSON.stringify(embedding);
          }
        }
      } catch {
        // Fall back to tsvector-only — no embedding
      }
    }

    const dbStart = performance.now();
    const supabase = await createClient();

    // Call the semantic overload (4 args) when we have an embedding,
    // otherwise call the original Phase 1 function (3 args).
    // PostgreSQL resolves the correct overload by argument names.
    const rpcParams = queryEmbedding
      ? { search_query: query, query_embedding: queryEmbedding, result_limit: limit, result_offset: offset }
      : { search_query: query, result_limit: limit, result_offset: offset };

    const { data, error } = await supabase.rpc("search_gallery_projects", rpcParams);

    const dbMs = Math.round(performance.now() - dbStart);

    if (error) {
      console.error("Search RPC failed:", error.message);
      return NextResponse.json(
        { error: "Search failed" },
        { status: 500 },
      );
    }

    const projects = ((data as GalleryFeedRow[]) || []).map(buildGalleryFeedRecord);
    const sets = groupByParentChild(projects);

    return NextResponse.json(sets, {
      headers: {
        "Server-Timing": `db;dur=${dbMs}`,
        ...(queryEmbedding ? { "X-Search-Mode": "semantic" } : {}),
      },
    });
  } catch (err) {
    return apiError(err, "Search failed");
  }
}
