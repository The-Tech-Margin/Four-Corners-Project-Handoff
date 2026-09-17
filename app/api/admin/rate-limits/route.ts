/**
 * Admin rate-limit stats API — aggregated request/block metrics.
 * Requires admin password session OR Supabase admin role.
 * Uses service_role to query rate_limit_log (bypasses RLS).
 * Returns ZERO personally-identifiable information.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
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

  // Optional hours param (default 24)
  const hours = parseInt(
    request.nextUrl.searchParams.get("hours") || "24",
    10,
  );
  const clampedHours = Math.min(Math.max(1, hours), 168); // 1h–7d

  try {
    const { data, error } = await sb.rpc("get_rate_limit_stats", {
      p_hours: clampedHours,
    });

    if (error) {
      return apiError(error, "Failed to fetch rate limit stats");
    }

    // Build time-series buckets for sparkline charting (client-side bucketing).
    const sinceMs = Date.now() - clampedHours * 3_600_000;
    const { data: rawLogs } = await sb
      .from("rate_limit_log")
      .select("created_at, blocked")
      .gte("created_at", new Date(sinceMs).toISOString())
      .limit(20_000);

    const bucketCount = 24;
    const bucketMs = (clampedHours * 3_600_000) / bucketCount;
    const requestSeries: { t: string; value: number }[] = [];
    const blockedSeries: { t: string; value: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const start = sinceMs + i * bucketMs;
      requestSeries.push({ t: new Date(start).toISOString(), value: 0 });
      blockedSeries.push({ t: new Date(start).toISOString(), value: 0 });
    }
    for (const row of rawLogs ?? []) {
      const t = new Date(row.created_at).getTime();
      const idx = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((t - sinceMs) / bucketMs)),
      );
      requestSeries[idx].value += 1;
      if (row.blocked) blockedSeries[idx].value += 1;
    }

    return NextResponse.json({
      ...data,
      request_series: requestSeries,
      blocked_series: blockedSeries,
    });
  } catch (error) {
    return apiError(error, "Failed to fetch rate limit stats");
  }
}

/** POST: trigger cleanup of old log entries */
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
    const { data, error } = await sb.rpc("cleanup_rate_limit_log", {
      p_retain_hours: 72,
    });

    if (error) {
      return apiError(error, "Cleanup failed");
    }

    return NextResponse.json({ ok: true, deleted: data });
  } catch {
    return NextResponse.json({ ok: true, note: "rpc not available" });
  }
}
