/**
 * Admin palette CRUD — list + create.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin } from "@/lib/admin-roles";
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

export async function GET() {
  if (!(await verifyAdminSession()) && !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("persona_palettes")
    .select("*")
    .order("name");

  if (error) {
    if (error.code === "42P01") return NextResponse.json([]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Join creator emails via auth admin API
  const creatorIds = Array.from(
    new Set((data ?? []).map((p) => p.created_by).filter(Boolean) as string[]),
  );
  const emailMap = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: authData } = await supabase.auth.admin.listUsers({
      perPage: 1000,
      page: 1,
    });
    for (const u of authData?.users ?? []) {
      if (u.email) emailMap.set(u.id, u.email);
    }
  }

  const enriched = (data ?? []).map((p) => ({
    ...p,
    created_by_email: p.created_by ? emailMap.get(p.created_by) ?? null : null,
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession()) && !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.slug || !body?.name) {
    return NextResponse.json(
      { error: "slug and name are required" },
      { status: 400 }
    );
  }

  const createdBy = await getCurrentUserId();

  const { data, error } = await supabase
    .from("persona_palettes")
    .insert({
      slug: body.slug,
      name: body.name,
      dark_overrides: body.dark_overrides || {},
      light_overrides: body.light_overrides || {},
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A palette with this slug already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
