/**
 * Admin stats API — aggregated platform metrics.
 * Requires admin password session OR Supabase admin role.
 * Uses service_role to query across all data (bypasses RLS).
 * Returns ZERO personally-identifiable information.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin } from "@/lib/admin-roles";
import { apiError } from "@/lib/api-error";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  // Dual auth: admin password cookie OR Supabase admin role
  const hasPasswordSession = await verifyAdminSession();
  const hasDbRole = await isCurrentUserAdmin();

  if (!hasPasswordSession && !hasDbRole) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 503 },
    );
  }

  try {
    // Live counts preferred over materialized view.
    const sevenDaysAgoIso = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [
      cachedStats,
      totalProjectsRes,
      publishedRes,
      galleryRes,
      privateRes,
      recentProjectsRes,
      allUsersRes,
      adminRolesRes,
      bannedCountRes,
    ] = await Promise.all([
      sb.from("platform_stats").select("*").limit(1).maybeSingle(),
      sb.from("projects").select("id", { count: "exact", head: true }),
      sb
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("published", true),
      sb
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("in_gallery", true),
      sb
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("published", false),
      sb
        .from("projects")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgoIso),
      sb.auth.admin.listUsers({ perPage: 1000, page: 1 }),
      sb
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .in("role", ["admin", "super_admin"]),
      // Fallback — banned count derived from listUsers response since there's
      // no separate counter endpoint
      Promise.resolve(null),
    ]);

    const cached = cachedStats.data;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allUsers = allUsersRes.data?.users ?? [];
    const recentUserCount = allUsers.filter(
      (u) => new Date(u.created_at).getTime() > sevenDaysAgo,
    ).length;
    const bannedUserCount = allUsers.filter((u) => {
      const banned = (u as { banned_until?: string | null }).banned_until;
      return !!banned && new Date(banned).getTime() > Date.now();
    }).length;
    void bannedCountRes;

    const stats = {
      users: {
        total: allUsers.length,
        newLast7Days: recentUserCount,
        admins: adminRolesRes.count ?? 0,
        banned: bannedUserCount,
      },
      projects: {
        total: totalProjectsRes.count ?? cached?.total_projects ?? 0,
        published: publishedRes.count ?? cached?.total_published ?? 0,
        gallery: galleryRes.count ?? cached?.total_gallery ?? 0,
        private: privateRes.count ?? cached?.total_private ?? 0,
        newLast7Days: recentProjectsRes.count ?? 0,
      },
      content: {
        contextItems: cached?.total_context_items ?? 0,
        projectsWithContext: cached?.projects_with_context ?? 0,
        transcriptions: cached?.total_transcriptions ?? 0,
      },
      cachedAt: cached?.refreshed_at ?? null,
      refreshedAt: new Date().toISOString(),
    };

    return NextResponse.json(stats);
  } catch (error) {
    return apiError(error, "Failed to fetch stats");
  }
}

/** POST: refresh the materialized view */
export async function POST() {
  const hasPasswordSession = await verifyAdminSession();
  const hasDbRole = await isCurrentUserAdmin();

  if (!hasPasswordSession && !hasDbRole) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 503 },
    );
  }

  try {
    await sb.rpc("refresh_platform_stats");
    return NextResponse.json({ ok: true });
  } catch {
    // If the RPC doesn't exist yet, fall back silently
    return NextResponse.json({ ok: true, note: "rpc not available" });
  }
}
