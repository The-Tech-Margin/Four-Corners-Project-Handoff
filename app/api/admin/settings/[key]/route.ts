/**
 * Admin app settings — get / upsert a single setting by key.
 *
 * GET  → { key, value }                   (value: jsonb, null if unset)
 * POST { value: <jsonb> } → { key, value } (upserts the row)
 *
 * Auth: password-session admin OR Supabase admin role.
 * Only keys in KNOWN_SETTINGS may be read or written — this is a typed flag store,
 * not an arbitrary KV. Add new entries here to expose them to the admin UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin, isCurrentUserSuperAdmin } from "@/lib/admin-roles";
import {
  MAINTENANCE_BANNER_KEY,
  MAINTENANCE_BANNER_ENABLED_KEY,
  MAINTENANCE_BANNER_DISMISSIBLE_KEY,
  MaintenanceBannerSchema,
  composeBanner,
  splitBanner,
} from "@/lib/maintenance-banner";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

const KNOWN_SETTINGS = new Set<string>([
  "gallery_explore_enabled",
  MAINTENANCE_BANNER_KEY,
  MAINTENANCE_BANNER_ENABLED_KEY,
  MAINTENANCE_BANNER_DISMISSIBLE_KEY,
]);

/**
 * Keys that require super_admin (not just admin) to write. The maintenance
 * banner is site-wide and visitor-facing, so it's held to the higher bar.
 */
const SUPER_ADMIN_ONLY_SETTINGS = new Set<string>([
  MAINTENANCE_BANNER_KEY,
  MAINTENANCE_BANNER_ENABLED_KEY,
  MAINTENANCE_BANNER_DISMISSIBLE_KEY,
]);

/** Discrete boolean rows — values must be plain booleans. */
const BOOLEAN_SETTINGS = new Set<string>([
  MAINTENANCE_BANNER_ENABLED_KEY,
  MAINTENANCE_BANNER_DISMISSIBLE_KEY,
]);

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  if (!(await verifyAdminSession()) && !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await ctx.params;
  if (!KNOWN_SETTINGS.has(key)) {
    return NextResponse.json({ error: "Unknown setting" }, { status: 404 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Banner reads compose the three rows (content + two discrete booleans)
  // into one schema-shaped object.
  if (key === MAINTENANCE_BANNER_KEY) {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [
        MAINTENANCE_BANNER_KEY,
        MAINTENANCE_BANNER_ENABLED_KEY,
        MAINTENANCE_BANNER_DISMISSIBLE_KEY,
      ]);
    const byKey = new Map((data ?? []).map((r) => [r.key, r.value]));
    return NextResponse.json({
      key,
      value: composeBanner(
        byKey.get(MAINTENANCE_BANNER_KEY),
        byKey.get(MAINTENANCE_BANNER_ENABLED_KEY),
        byKey.get(MAINTENANCE_BANNER_DISMISSIBLE_KEY),
      ),
    });
  }

  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .eq("key", key)
    .maybeSingle();

  return NextResponse.json({ key, value: data?.value ?? null });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  if (!(await verifyAdminSession()) && !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await ctx.params;
  if (!KNOWN_SETTINGS.has(key)) {
    return NextResponse.json({ error: "Unknown setting" }, { status: 404 });
  }

  // Visitor-facing site-wide settings require super_admin specifically — a
  // password-only admin session is not sufficient.
  if (SUPER_ADMIN_ONLY_SETTINGS.has(key) && !(await isCurrentUserSuperAdmin())) {
    return NextResponse.json(
      { error: "Super admin required" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || !("value" in body)) {
    return NextResponse.json({ error: "Missing value" }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Banner writes are schema-validated, then split across three rows:
  // content under maintenance_banner, the booleans as discrete keys.
  if (key === MAINTENANCE_BANNER_KEY) {
    const parsed = MaintenanceBannerSchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid banner config", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { content, enabled, dismissible } = splitBanner(parsed.data);
    const now = new Date().toISOString();
    const { error } = await supabase.from("app_settings").upsert([
      { key: MAINTENANCE_BANNER_KEY, value: content, updated_at: now },
      { key: MAINTENANCE_BANNER_ENABLED_KEY, value: enabled, updated_at: now },
      {
        key: MAINTENANCE_BANNER_DISMISSIBLE_KEY,
        value: dismissible,
        updated_at: now,
      },
    ]);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ key, value: parsed.data });
  }

  // Discrete boolean rows accept only plain booleans.
  if (BOOLEAN_SETTINGS.has(key) && typeof body.value !== "boolean") {
    return NextResponse.json(
      { error: "Value must be a boolean" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value: body.value, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ key, value: body.value });
}
