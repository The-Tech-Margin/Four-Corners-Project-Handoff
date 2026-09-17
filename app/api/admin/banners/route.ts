/**
 * Admin banner library — list / save reusable maintenance banner configs.
 *
 * GET  → { banners: [{ slug, label, config, is_preset }] }
 * POST { slug?, label, config } → { banner }   (upsert by slug; super_admin)
 * DELETE ?slug=… → { ok: true }                (any row; super_admin)
 *
 * Backed by the maintenance_banners table (migration 054). The ACTIVE banner
 * is still the `maintenance_banner` key in app_settings — activating goes
 * through /api/admin/settings/maintenance_banner. The list reflects the DB
 * only — populate it with `npx tsx scripts/seed-maintenance-banners.ts`.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin, isCurrentUserSuperAdmin } from "@/lib/admin-roles";
import { MaintenanceBannerSchema } from "@/lib/maintenance-banner";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

export interface BannerLibraryRow {
  slug: string;
  label: string;
  config: unknown;
  is_preset: boolean;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    .from("maintenance_banners")
    .select("slug, label, config, is_preset")
    .order("is_preset", { ascending: false })
    .order("label");

  if (error) {
    // Table not migrated yet — empty list with a hint, never phantom content.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({
        banners: [],
        pendingMigration: true,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ banners: data ?? [] });
}

export async function POST(req: NextRequest) {
  // Library writes are super-admin only, same bar as activating the banner.
  if (!(await isCurrentUserSuperAdmin())) {
    return NextResponse.json({ error: "Super admin required" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.label || typeof body.label !== "string" || !body.config) {
    return NextResponse.json(
      { error: "label and config are required" },
      { status: 400 },
    );
  }

  const parsed = MaintenanceBannerSchema.safeParse(body.config);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid banner config", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const label = body.label.trim().slice(0, 80);
  const slug =
    typeof body.slug === "string" && /^[a-z0-9-]{1,64}$/.test(body.slug)
      ? body.slug
      : `custom-${label
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/--+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48)}`;

  if (!slug || slug === "custom-") {
    return NextResponse.json({ error: "Label must contain letters or numbers" }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("maintenance_banners")
    .upsert(
      {
        slug,
        label,
        config: parsed.data,
        is_preset: false,
        created_by: await getCurrentUserId(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("slug, label, config, is_preset")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ banner: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!(await isCurrentUserSuperAdmin())) {
    return NextResponse.json({ error: "Super admin required" }, { status: 403 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Any row may be deleted; shipped presets can be restored with
  // scripts/seed-maintenance-banners.ts.
  const { error } = await supabase
    .from("maintenance_banners")
    .delete()
    .eq("slug", slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
