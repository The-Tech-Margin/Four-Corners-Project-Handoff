/**
 * Public global palette — returns the site-wide default palette if one is set.
 * No auth required. Used by PersonaProvider as fallback when no ?persona= param.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicKey } from "@/lib/supabase/public-key";

/** Force dynamic — this reads from DB and must not be statically cached */
export const dynamic = "force-dynamic";

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublicKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  const supabase = getAnonClient();
  if (!supabase) {
    return NextResponse.json(null);
  }

  const headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  const { data, error } = await supabase
    .from("persona_palettes")
    .select("slug, name, dark_overrides, light_overrides, is_global")
    .eq("is_global", true)
    .maybeSingle();

  if (error) {
    // Table or column may not exist if migrations 018/021 haven't been applied
    if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
      console.warn("[palettes/global] table not found — migration pending");
    } else {
      console.warn("[palettes/global] query error:", error.message);
    }
    return NextResponse.json(null, { headers });
  }

  if (!data) {
    return NextResponse.json(null, { headers });
  }

  return NextResponse.json(data, { headers });
}
