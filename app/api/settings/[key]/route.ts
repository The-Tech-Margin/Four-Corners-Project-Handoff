/**
 * Public app settings — read a single setting by key.
 *
 * GET → { key, value }  (value: jsonb, null if unset/missing)
 *
 * No auth required. These are non-sensitive feature flags consumed by the UI.
 * Only keys in PUBLIC_SETTINGS are exposed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  MAINTENANCE_BANNER_KEY,
  MAINTENANCE_BANNER_ENABLED_KEY,
  MAINTENANCE_BANNER_DISMISSIBLE_KEY,
  composeBanner,
} from "@/lib/maintenance-banner";
import { getSupabasePublicKey } from "@/lib/supabase/public-key";

export const dynamic = "force-dynamic";

const PUBLIC_SETTINGS = new Set<string>([
  "gallery_explore_enabled",
  MAINTENANCE_BANNER_KEY,
]);

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublicKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { key } = await ctx.params;

  const headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  if (!PUBLIC_SETTINGS.has(key)) {
    return NextResponse.json({ error: "Unknown setting" }, { status: 404, headers });
  }

  const supabase = getAnonClient();
  if (!supabase) {
    return NextResponse.json({ key, value: null }, { headers });
  }

  // The banner is stored as three rows (content + two discrete booleans) and
  // composed into one schema-validated object so the client always gets a
  // well-formed config.
  if (key === MAINTENANCE_BANNER_KEY) {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [
        MAINTENANCE_BANNER_KEY,
        MAINTENANCE_BANNER_ENABLED_KEY,
        MAINTENANCE_BANNER_DISMISSIBLE_KEY,
      ]);

    if (error) {
      console.warn("[settings] banner query error:", error.message);
      return NextResponse.json({ key, value: null }, { headers });
    }

    const byKey = new Map((data ?? []).map((r) => [r.key, r.value]));
    const value = composeBanner(
      byKey.get(MAINTENANCE_BANNER_KEY),
      byKey.get(MAINTENANCE_BANNER_ENABLED_KEY),
      byKey.get(MAINTENANCE_BANNER_DISMISSIBLE_KEY),
    );
    return NextResponse.json({ key, value }, { headers });
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
      console.warn("[settings] table not found — migration 047 pending");
    } else {
      console.warn("[settings] query error:", error.message);
    }
    return NextResponse.json({ key, value: null }, { headers });
  }

  return NextResponse.json({ key, value: data?.value ?? null }, { headers });
}
