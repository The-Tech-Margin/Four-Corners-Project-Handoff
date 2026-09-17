import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";
import { getAIGatewayKey, AI_GATEWAY_CONFIG } from "@/lib/ai-gateway";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // Require authentication for AI features
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { prompt, systemPrompt, model, maxTokens } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Validate prompt length (10k chars max)
    if (prompt.length > 10000) {
      return NextResponse.json(
        { error: "Prompt exceeds maximum length" },
        { status: 400 }
      );
    }

    // Validate system prompt if provided
    if (systemPrompt && systemPrompt.length > 5000) {
      return NextResponse.json(
        { error: "System prompt exceeds maximum length" },
        { status: 400 }
      );
    }

    const apiKey = getAIGatewayKey();
    const selectedModel = model || AI_GATEWAY_CONFIG.defaultModel;

    // Use OpenAI-compatible API through Vercel AI Gateway
    const response = await fetch(
      "https://api.vercel.com/v1/ai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            ...(systemPrompt
              ? [{ role: "system", content: systemPrompt }]
              : []),
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens || AI_GATEWAY_CONFIG.maxTokens.default,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("AI Gateway error:", error);
      return NextResponse.json(
        { error: "Failed to generate text from AI Gateway" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Error in AI generation:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
