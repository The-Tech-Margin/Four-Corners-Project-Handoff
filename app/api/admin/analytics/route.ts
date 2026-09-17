/**
 * Admin analytics aggregator — fans out to the page_views RPCs from
 * migration 033 and returns a single payload for /admin/analytics.
 *
 * Requires admin password session OR Supabase admin role. Uses
 * service_role to bypass RLS on page_views.
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

  const hours = Math.min(
    Math.max(1, parseInt(request.nextUrl.searchParams.get("hours") || "24", 10)),
    168,
  );

  try {
    const [
      summaryRes,
      topPagesRes,
      topReferrersRes,
      browserRes,
      osRes,
      countryRes,
      utmRes,
    ] = await Promise.all([
      sb.rpc("get_page_views_summary", { p_hours: hours }),
      sb.rpc("get_top_pages", { p_hours: hours, p_limit: 10 }),
      sb.rpc("get_top_referrers", { p_hours: hours, p_limit: 10 }),
      sb.rpc("get_browser_breakdown", { p_hours: hours }),
      sb.rpc("get_os_breakdown", { p_hours: hours }),
      sb.rpc("get_pv_country_breakdown", { p_hours: hours }),
      sb.rpc("get_utm_breakdown", { p_hours: hours, p_limit: 10 }),
    ]);

    // summary RPC returns a single-row table — normalise
    const summaryRow =
      Array.isArray(summaryRes.data) && summaryRes.data[0]
        ? summaryRes.data[0]
        : {
            total_views: 0,
            unique_sessions: 0,
            unique_paths: 0,
            unique_countries: 0,
          };

    return NextResponse.json({
      summary: {
        total_views: Number(summaryRow.total_views ?? 0),
        unique_sessions: Number(summaryRow.unique_sessions ?? 0),
        unique_paths: Number(summaryRow.unique_paths ?? 0),
        unique_countries: Number(summaryRow.unique_countries ?? 0),
      },
      topPages: topPagesRes.data ?? [],
      topReferrers: topReferrersRes.data ?? [],
      browsers: browserRes.data ?? [],
      operatingSystems: osRes.data ?? [],
      countries: countryRes.data ?? [],
      utm: utmRes.data ?? [],
      since: new Date(Date.now() - hours * 3600_000).toISOString(),
    });
  } catch (error) {
    return apiError(error, "Failed to fetch analytics");
  }
}
