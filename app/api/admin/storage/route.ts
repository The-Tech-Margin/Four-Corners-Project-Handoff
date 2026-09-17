/**
 * Admin storage API — per-user storage usage + plan summary.
 *
 * Returns the top-N users by SUM(user_assets.file_size) along with each
 * user's plan name, so operators can spot heavy uploaders and confirm who
 * needs a plan bump. Uses the service role to bypass RLS across all users.
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

export async function GET(request: Request) {
  // Dual auth — same pattern as /api/admin/stats
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

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 200);

  try {
    // Storage totals come from the RPC that reads storage.objects directly
    // (source of truth). Fall back to SUM(user_assets.file_size) when the
    // RPC isn't deployed yet — user_assets covers post-migration uploads so
    // new environments still see recent activity.
    const [storageTotals, plansRes] = await Promise.all([
      sb.rpc("get_storage_totals_by_user").then(
        (res) => res,
        () => ({ data: null, error: null }),
      ),
      // Fail-soft: user_plans is optional. Migration 039 may not be applied
      // yet on older environments; without it we just treat everyone as
      // 'free'. Errors here are logged but never block the storage summary.
      sb
        .from("user_plans")
        .select("user_id, plan, custom_limit_bytes")
        .then(
          (res) => res,
          () => ({ data: [], error: null }),
        ),
    ]);

    const usage = new Map<string, { used: number; count: number }>();

    // Primary path: RPC result.
    const rpcRows = (storageTotals.data as
      | { user_id: string; total_bytes: number; object_count: number }[]
      | null) ?? null;

    if (rpcRows && rpcRows.length > 0) {
      for (const row of rpcRows) {
        usage.set(row.user_id, {
          used: Number(row.total_bytes) || 0,
          count: Number(row.object_count) || 0,
        });
      }
    } else {
      // Fallback: sum user_assets.file_size (only covers post-migration rows).
      const fallbackRes = await sb
        .from("user_assets")
        .select("user_id, file_size");
      if (fallbackRes.error) throw fallbackRes.error;
      for (const row of (fallbackRes.data ?? []) as {
        user_id: string;
        file_size: number | null;
      }[]) {
        const cur = usage.get(row.user_id) ?? { used: 0, count: 0 };
        cur.used += row.file_size ?? 0;
        cur.count += 1;
        usage.set(row.user_id, cur);
      }
    }

    if (plansRes.error) {
      console.warn(
        "[/api/admin/storage] user_plans unavailable:",
        plansRes.error,
      );
    }

    // Index plans by user_id. Empty when user_plans isn't available (fail-soft
    // above) — every user then falls through to the free-tier default.
    const plans = new Map<
      string,
      { plan: string; customLimit: number | null }
    >();
    const plansRows =
      (plansRes.data as
        | {
            user_id: string;
            plan: string;
            custom_limit_bytes: number | null;
          }[]
        | null) ?? [];
    for (const row of plansRows) {
      plans.set(row.user_id, {
        plan: row.plan,
        customLimit: row.custom_limit_bytes,
      });
    }

    // Build sorted top-N. Users without a plan row are treated as 'free'.
    const entries = Array.from(usage.entries()).map(([userId, u]) => {
      const planRow = plans.get(userId) ?? { plan: "free", customLimit: null };
      const limitBytes = resolvePlanLimit(planRow.plan, planRow.customLimit);
      return {
        userId,
        plan: planRow.plan,
        used: u.used,
        assetCount: u.count,
        limit: limitBytes,
        ratio: limitBytes > 0 ? u.used / limitBytes : 0,
      };
    });

    entries.sort((a, b) => b.used - a.used);

    // Also expose a grand total for an at-a-glance "total storage in use".
    const totalUsed = entries.reduce((sum, e) => sum + e.used, 0);

    return NextResponse.json({
      users: entries.slice(0, limit),
      totalUsers: entries.length,
      totalUsedBytes: totalUsed,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error, "Failed to fetch storage summary");
  }
}
