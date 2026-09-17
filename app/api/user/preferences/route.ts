/**
 * User preferences API — palette override and future settings.
 *
 * GET  /api/user/preferences — returns current user's preferences
 *      with full palette data inline (avoids a second round-trip).
 * PUT  /api/user/preferences — upserts palette_slug (validates slug exists)
 *
 * Auth: requires Supabase session (RLS scopes to auth.uid()).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .select("palette_slug, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to read user preferences:", error.message);
      return NextResponse.json({ error: "Failed to read preferences" }, { status: 500 });
    }

    const slug = data?.palette_slug ?? null;

    // Return full palette data inline so the client doesn't need a second fetch
    if (slug) {
      const { data: palette } = await supabase
        .from("persona_palettes")
        .select("slug, name, dark_overrides, light_overrides")
        .eq("slug", slug)
        .maybeSingle();

      if (palette) {
        return NextResponse.json({
          palette_slug: slug,
          palette: palette,
        });
      }
    }

    return NextResponse.json({ palette_slug: null, palette: null });
  } catch (err) {
    return apiError(err, "Failed to read preferences");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const paletteSlug: string | null = body.palette_slug ?? null;

    // Validate slug exists if non-null
    if (paletteSlug !== null) {
      const { data: palette } = await supabase
        .from("persona_palettes")
        .select("slug")
        .eq("slug", paletteSlug)
        .maybeSingle();

      if (!palette) {
        return NextResponse.json({ error: "Palette not found" }, { status: 404 });
      }
    }

    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: user.id,
          palette_slug: paletteSlug,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) {
      console.error("Failed to save user preferences:", error.message);
      return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
    }

    return NextResponse.json({ palette_slug: paletteSlug });
  } catch (err) {
    return apiError(err, "Failed to save preferences");
  }
}
