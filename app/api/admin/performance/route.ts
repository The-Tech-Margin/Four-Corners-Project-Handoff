/**
 * Admin performance API — Web Vitals metrics from speed_insights table.
 * Requires admin password session OR Supabase admin role.
 * Uses service_role to query across all data (bypasses RLS).
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
  const hasPasswordSession = await verifyAdminSession();
  const hasDbRole = await isCurrentUserAdmin();

  if (!hasPasswordSession && !hasDbRole) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  try {
    const hours = Math.min(Math.max(1, parseInt(request.nextUrl.searchParams.get("hours") || "24", 10)), 168);

    const [
      summaryRes,
      byRouteRes,
      byDeviceRes,
      byGeoRes,
      byBrowserEngineRes,
      byOsRes,
      byDeviceBrandRes,
      byClientRes,
      byConnectionRes,
      totalRes,
    ] = await Promise.all([
      sb.rpc("get_web_vitals_summary", { p_hours: hours }),
      sb.rpc("get_web_vitals_by_route", { p_hours: hours, p_limit: 20 }),
      sb.rpc("get_web_vitals_by_device", { p_hours: hours }),
      sb.rpc("get_geo_breakdown", { p_hours: hours }),
      sb.rpc("get_web_vitals_by_browser_engine", { p_hours: hours, p_limit: 20 }),
      sb.rpc("get_web_vitals_by_os", { p_hours: hours, p_limit: 20 }),
      sb.rpc("get_web_vitals_by_device_brand", { p_hours: hours, p_limit: 20 }),
      sb.rpc("get_web_vitals_by_client", { p_hours: hours, p_limit: 20 }),
      sb.rpc("get_web_vitals_by_connection", { p_hours: hours }),
      sb
        .from("speed_insights")
        .select("id", { count: "exact", head: true })
        .gte(
          "timestamp",
          new Date(Date.now() - hours * 3600_000).toISOString(),
        ),
    ]);

    return NextResponse.json({
      summary: summaryRes.data ?? [],
      byRoute: byRouteRes.data ?? [],
      byDevice: byDeviceRes.data ?? [],
      // byGeo may be empty if migration 032 is not yet applied
      byGeo: byGeoRes.error ? [] : (byGeoRes.data ?? []),
      // Drain-only breakdowns — empty until migration 048 is applied
      byBrowserEngine: byBrowserEngineRes.error ? [] : (byBrowserEngineRes.data ?? []),
      byOs: byOsRes.error ? [] : (byOsRes.data ?? []),
      byDeviceBrand: byDeviceBrandRes.error ? [] : (byDeviceBrandRes.data ?? []),
      byClient: byClientRes.error ? [] : (byClientRes.data ?? []),
      byConnection: byConnectionRes.error ? [] : (byConnectionRes.data ?? []),
      total: totalRes.count ?? 0,
      since: new Date(Date.now() - hours * 3600_000).toISOString(),
    });
  } catch (error) {
    return apiError(error, "Failed to fetch performance stats");
  }
}
