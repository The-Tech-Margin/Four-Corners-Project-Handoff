/**
 * Admin global palette — set or clear the site-wide default palette.
 *
 * POST { slug: "my-palette" } — sets that palette as global
 * POST { slug: null }         — clears the global palette
 * GET                         — returns the current global palette slug (or null)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin, isCurrentUserSuperAdmin } from "@/lib/admin-roles";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  if (!(await verifyAdminSession()) && !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data } = await supabase
    .from("persona_palettes")
    .select("slug, name")
    .eq("is_global", true)
    .maybeSingle();

  return NextResponse.json({ global_slug: data?.slug ?? null, global_name: data?.name ?? null });
}

export async function POST(req: NextRequest) {
  // Setting global palette is restricted to super_admin (or password-session admin)
  if (!(await verifyAdminSession()) && !(await isCurrentUserSuperAdmin())) {
    return NextResponse.json(
      { error: "Only super_admin can set the global palette" },
      { status: 403 },
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const targetSlug: string | null = body?.slug ?? null;

  // Clear all global flags first
  await supabase
    .from("persona_palettes")
    .update({ is_global: false })
    .eq("is_global", true);

  // Set the new global palette if specified
  if (targetSlug) {
    const { error } = await supabase
      .from("persona_palettes")
      .update({ is_global: true })
      .eq("slug", targetSlug);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ global_slug: targetSlug });
}
