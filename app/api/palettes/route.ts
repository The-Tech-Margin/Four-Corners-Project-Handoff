/**
 * Public palette listing — slug + name only.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicKey } from "@/lib/supabase/public-key";

export const dynamic = "force-dynamic";

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublicKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  const supabase = getAnonClient();
  if (!supabase) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("persona_palettes")
    .select("slug, name")
    .order("name");

  if (error) return NextResponse.json([]);

  return NextResponse.json(data);
}
