import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIGatewayKey, AI_GATEWAY_CONFIG } from "@/lib/ai-gateway";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/ai/embed — Generate and store a search embedding for a project.
 *
 * Assembles text from all normalized tables via the `get_project_search_text`
 * RPC, generates an embedding via OpenAI text-embedding-3-small through the
 * Vercel AI Gateway, and stores the result in projects.search_embedding.
 *
 * Designed to be called fire-and-forget after project save.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Auth check via server client (reads auth cookies)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { project_id } = await request.json();

    if (!project_id || !UUID_RE.test(project_id)) {
      return NextResponse.json(
        { error: "Valid project_id required" },
        { status: 400 },
      );
    }

    // Get assembled search text from all normalized tables
    const { data: searchText, error: rpcError } = await supabase.rpc(
      "get_project_search_text",
      { target_project_id: project_id },
    );

    if (rpcError) {
      console.error("get_project_search_text RPC failed:", rpcError.message);
      return NextResponse.json({ error: "Failed to get project text" }, { status: 500 });
    }

    // Skip if text is too short to embed meaningfully
    if (!searchText || searchText.trim().length < 10) {
      return NextResponse.json({ skipped: true });
    }

    // Truncate to max embedding input length
    const text = searchText.slice(0, AI_GATEWAY_CONFIG.maxEmbeddingChars);

    // Generate embedding via Vercel AI Gateway
    const apiKey = getAIGatewayKey();
    const embResponse = await fetch(
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

    if (!embResponse.ok) {
      const err = await embResponse.text();
      console.error("Embedding API error:", err);
      return NextResponse.json(
        { error: "Failed to generate embedding" },
        { status: embResponse.status },
      );
    }

    const embData = await embResponse.json();
    const embedding = embData.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      return NextResponse.json(
        { error: "Invalid embedding response" },
        { status: 500 },
      );
    }

    // Store embedding — pgvector accepts JSON array string
    const { error: updateError } = await supabase
      .from("projects")
      .update({ search_embedding: JSON.stringify(embedding) })
      .eq("id", project_id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to store embedding:", updateError.message);
      return NextResponse.json(
        { error: "Failed to store embedding" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Embed error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
