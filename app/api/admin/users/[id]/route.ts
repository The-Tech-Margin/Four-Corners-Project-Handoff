/**
 * Admin user detail — non-PII rollups for a single user.
 *
 * Returns project counts, content stats, last activity. No raw content,
 * no email beyond what's already shown, no IP, no analytics events.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin } from "@/lib/admin-roles";
import { apiError } from "@/lib/api-error";
import { resolvePlanLimit } from "@/lib/upload-limits";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  if (!(await verifyAdminSession()) && !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await ctx.params;

  const sb = getServiceClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 503 },
    );
  }

  try {
    const [
      authUserRes,
      projectsRes,
      publishedRes,
      galleryRes,
      contextRes,
      transcriptionsRes,
      latestProjectRes,
      rolesRes,
      assetsRes,
      planRes,
    ] = await Promise.all([
      sb.auth.admin.getUserById(userId),
      sb
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      sb
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("published", true),
      sb
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("in_gallery", true),
      sb
        .from("context_items")
        .select("id", { count: "exact", head: true })
        .in(
          "project_id",
          (
            await sb.from("projects").select("id").eq("user_id", userId)
          ).data?.map((p) => p.id) ?? [],
        ),
      sb
        .from("voice_transcriptions")
        .select("id", { count: "exact", head: true })
        .in(
          "project_id",
          (
            await sb.from("projects").select("id").eq("user_id", userId)
          ).data?.map((p) => p.id) ?? [],
        ),
      sb
        .from("projects")
        .select("created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", userId),
      // Storage rollup — true bytes from storage.objects via RPC (source of
      // truth). Falls back to SUM(user_assets.file_size) below if the RPC
      // isn't deployed yet. Fail-soft on both paths.
      sb.rpc("get_storage_total_for_user", { target_user_id: userId }).then(
        (res) => res,
        () => ({ data: null, error: null }),
      ),
      // Plan row — may not exist if the user hasn't been provisioned yet
      // OR if migration 039 hasn't been applied. Either way, fall back to
      // the free tier.
      sb
        .from("user_plans")
        .select("plan, custom_limit_bytes")
        .eq("user_id", userId)
        .maybeSingle()
        .then(
          (res) => res,
          () => ({ data: null, error: null }),
        ),
    ]);

    if (authUserRes.error || !authUserRes.data?.user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = authUserRes.data.user;
    const bannedUntil = (user as { banned_until?: string | null }).banned_until ?? null;
    const isBanned =
      !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

    // Storage rollup: prefer RPC (true bytes from storage.objects).
    // Fall back to user_assets.file_size sum if the RPC returned no rows.
    let storageUsed = 0;
    const rpcRows =
      (assetsRes.data as
        | { total_bytes: number; object_count: number }[]
        | null) ?? null;
    if (rpcRows && rpcRows.length > 0) {
      storageUsed = Number(rpcRows[0].total_bytes) || 0;
    } else {
      const fb = await sb
        .from("user_assets")
        .select("file_size")
        .eq("user_id", userId);
      const rows = (fb.data as { file_size: number | null }[] | null) ?? [];
      for (const r of rows) storageUsed += r.file_size ?? 0;
    }

    const planRow = planRes.data as
      | { plan: string; custom_limit_bytes: number | null }
      | null;
    const plan = planRow?.plan ?? "free";
    const customLimit = planRow?.custom_limit_bytes ?? null;
    const storageLimit = resolvePlanLimit(plan, customLimit);

    return NextResponse.json({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null,
      banned: isBanned,
      banned_until: bannedUntil,
      provider:
        (user.app_metadata as { provider?: string } | undefined)?.provider ??
        "email",
      roles: (rolesRes.data ?? []).map((r) => r.role as string),
      stats: {
        projects_total: projectsRes.count ?? 0,
        projects_published: publishedRes.count ?? 0,
        projects_in_gallery: galleryRes.count ?? 0,
        context_items: contextRes.count ?? 0,
        voice_transcriptions: transcriptionsRes.count ?? 0,
        last_project_at:
          latestProjectRes.data?.updated_at ??
          latestProjectRes.data?.created_at ??
          null,
      },
      storage: {
        plan,
        custom_limit_bytes: customLimit,
        used: storageUsed,
        limit: storageLimit,
        ratio: storageLimit > 0 ? storageUsed / storageLimit : 0,
      },
    });
  } catch (error) {
    return apiError(error, "Failed to fetch user detail");
  }
}
