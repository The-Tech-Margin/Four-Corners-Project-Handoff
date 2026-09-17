/**
 * Admin: backfill search embeddings for all projects.
 *
 * POST /api/admin/backfill-embeddings
 *
 * Processes projects where search_embedding IS NULL, batching 10 at a time
 * with 1-second delays between batches to respect API rate limits.
 * Idempotent — re-running safely skips already-embedded projects.
 *
 * Requires admin password session OR Supabase admin role.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin } from "@/lib/admin-roles";
import { getAIGatewayKey, AI_GATEWAY_CONFIG } from "@/lib/ai-gateway";
import { apiError } from "@/lib/api-error";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST() {
  // Dual auth: admin password cookie OR Supabase admin role
  const hasPasswordSession = await verifyAdminSession();
  const hasDbRole = await isCurrentUserAdmin();

  if (!hasPasswordSession && !hasDbRole) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  try {
    const apiKey = getAIGatewayKey();

    // Get all project IDs without embeddings
    const { data: projects, error: queryError } = await supabase
      .from("projects")
      .select("id")
      .is("search_embedding", null)
      .order("created_at", { ascending: false });

    if (queryError) throw queryError;
    if (!projects || projects.length === 0) {
      return NextResponse.json({ processed: 0, skipped: 0, errors: 0 });
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const batch = projects.slice(i, i + BATCH_SIZE);

      // Delay between batches (skip first)
      if (i > 0) await sleep(BATCH_DELAY_MS);

      await Promise.all(
        batch.map(async ({ id }) => {
          try {
            // Get assembled search text
            const { data: searchText, error: rpcError } = await supabase.rpc(
              "get_project_search_text",
              { target_project_id: id },
            );

            if (rpcError) {
              console.error(`Text RPC failed for ${id}:`, rpcError.message);
              errors++;
              return;
            }

            if (!searchText || searchText.trim().length < 10) {
              skipped++;
              return;
            }

            const text = searchText.slice(0, AI_GATEWAY_CONFIG.maxEmbeddingChars);

            // Generate embedding
            const embRes = await fetch(
              "https://ai-gateway.vercel.sh/v1/embeddings",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: AI_GATEWAY_CONFIG.embeddingModel,
                  input: text,
                }),
              },
            );

            if (!embRes.ok) {
              console.error(`Embedding failed for ${id}: ${embRes.status}`);
              errors++;
              return;
            }

            const embData = await embRes.json();
            const embedding = embData.data?.[0]?.embedding;

            if (!Array.isArray(embedding)) {
              errors++;
              return;
            }

            // Store embedding
            const { error: updateError } = await supabase
              .from("projects")
              .update({ search_embedding: JSON.stringify(embedding) })
              .eq("id", id);

            if (updateError) {
              console.error(`Update failed for ${id}:`, updateError.message);
              errors++;
              return;
            }

            processed++;
          } catch (err) {
            console.error(`Backfill error for ${id}:`, err);
            errors++;
          }
        }),
      );
    }

    return NextResponse.json({ processed, skipped, errors, total: projects.length });
  } catch (err) {
    return apiError(err, "Backfill failed");
  }
}
