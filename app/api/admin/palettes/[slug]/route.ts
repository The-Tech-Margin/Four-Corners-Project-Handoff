/**
 * Admin palette CRUD — get / update / delete by slug.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin, isCurrentUserSuperAdmin } from "@/lib/admin-roles";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Ownership check: super_admin bypasses; otherwise the current user must
 * match palette.created_by. Password-session admins (no Supabase user) are
 * treated as super-admin-equivalent since they authenticated via env password.
 */
async function canMutatePalette(
  slug: string,
  supabase: ReturnType<typeof getServiceClient>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!supabase) return { ok: false, status: 503, error: "Database not configured" };

  // Password-session admin bypasses ownership (legacy full-access)
  if (await verifyAdminSession()) return { ok: true };

  // Super-admin bypasses ownership
  if (await isCurrentUserSuperAdmin()) return { ok: true };

  const { data: palette, error } = await supabase
    .from("persona_palettes")
    .select("created_by")
    .eq("slug", slug)
    .single();

  if (error || !palette) {
    return { ok: false, status: 404, error: "Not found" };
  }

  const userId = await getCurrentUserId();
  if (!userId || palette.created_by !== userId) {
    return { ok: false, status: 403, error: "You can only modify palettes you created" };
  }

  return { ok: true };
}

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  if (!(await verifyAdminSession()) && !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await ctx.params;
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("persona_palettes")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  if (!(await verifyAdminSession()) && !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await ctx.params;
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const ownership = await canMutatePalette(slug, supabase);
  if (!ownership.ok) {
    return NextResponse.json({ error: ownership.error }, { status: ownership.status });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.dark_overrides !== undefined) updates.dark_overrides = body.dark_overrides;
  if (body.light_overrides !== undefined) updates.light_overrides = body.light_overrides;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("persona_palettes")
    .update(updates)
    .eq("slug", slug)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  if (!(await verifyAdminSession()) && !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await ctx.params;
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const ownership = await canMutatePalette(slug, supabase);
  if (!ownership.ok) {
    return NextResponse.json({ error: ownership.error }, { status: ownership.status });
  }

  const { error } = await supabase
    .from("persona_palettes")
    .delete()
    .eq("slug", slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
