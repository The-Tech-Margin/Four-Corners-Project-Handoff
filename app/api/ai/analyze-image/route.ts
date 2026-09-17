import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";

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

    const { imageDataUrl, prompt, context } = await request.json();

    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "Image data URL is required" },
        { status: 400 }
      );
    }

    // Validate image data URL format and size (10MB limit)
    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Invalid image format" },
        { status: 400 }
      );
    }

    const base64Length = imageDataUrl.split(",")[1]?.length || 0;
    const sizeInBytes = (base64Length * 3) / 4;
    const sizeInMB = sizeInBytes / (1024 * 1024);

    if (sizeInMB > 10) {
      return NextResponse.json(
        { error: "Image size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "AI service temporarily unavailable" },
        { status: 503 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are assisting an NGO photographer in creating accessible image descriptions for viewers who cannot see the image. Your descriptions should paint a vivid, detailed picture that allows someone to understand the complete scene, context, and significance of the photograph. Descriptions should be suitable for professional metadata, advocacy materials, and archival purposes.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  prompt ||
                  `Describe this image as if you are helping someone who cannot see it understand what is depicted. ${
                    context
                      ? `Here is context already provided by the photographer: ${context}. Use this information to enhance your description.`
                      : ""
                  } Include: 1) The overall scene and setting in detail, 2) People present and what they are doing (describe appearance, actions, expressions without naming individuals), 3) Environmental details (lighting, weather, surroundings, conditions), 4) Objects, activities, and interactions happening, 5) The emotional tone and atmosphere, 6) Spatial relationships and composition. Write a complete, vivid description that allows the reader to fully visualize and understand the scene, its context, and significance. Be factual, respectful, and thorough.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI vision error:", response.status, errorText);

      let errorMessage = "Failed to analyze image";

      if (response.status === 429) {
        errorMessage =
          "Rate limit exceeded. Please wait a moment and try again.";
      } else if (response.status === 401) {
        errorMessage =
          "Invalid API key. Please check your OPENAI_API_KEY configuration.";
      } else if (response.status === 400) {
        errorMessage = "Invalid image format. Please try a different image.";
      } else {
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch {
          errorMessage = `Image analysis failed: ${errorText.substring(
            0,
            100
          )}`;
        }
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content || "";

    return NextResponse.json({ description });
  } catch (error) {
    console.error("Error in image analysis:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
