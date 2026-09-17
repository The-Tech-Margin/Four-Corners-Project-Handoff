/**
 * Admin content API — tag distribution, geography, equipment stats.
 * Requires admin password session OR Supabase admin role.
 * Uses service_role to query across all data (bypasses RLS).
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
    const [tagsRes, equipmentRes] = await Promise.all([
      sb.rpc("get_tag_distribution", { p_limit: 50 }),
      sb.rpc("get_equipment_stats", { p_limit: 10 }),
    ]);

    return NextResponse.json({
      tags: tagsRes.data ?? [],
      equipment: equipmentRes.data ?? [],
    });
  } catch (error) {
    return apiError(error, "Failed to fetch content stats");
  }
}
