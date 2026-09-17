/**
 * Admin issues API — list submitted issue reports (read-only).
 * Requires admin password session OR Supabase admin role.
 * Uses service_role to read issue_reports (bypasses RLS) and to mint
 * short-lived signed URLs for private screenshots.
 *
 * No write operations — status transitions are deferred to a later pass.
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

const SIGNED_URL_TTL_SECONDS = 300; // 5 min — enough to view in the dashboard

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

  const limit = Math.min(
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "100", 10)),
    200,
  );

  try {
    const { data: rows, error } = await sb
      .from("issue_reports")
      .select(
        "id, status, type, severity, title, description, steps, extra, reporter_email, " +
          "url, route, app_state, device, build, diagnostics, user_agent, " +
          "screenshot_path, priority, assignee, resolution, resolved_at, reviewed_by, " +
          "created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return apiError(error, "Failed to fetch issues");
    }

    // The service client is untyped (no generated DB types), so widen the
    // rows to a concrete shape for the screenshot lookup below.
    const typedRows = (rows ?? []) as unknown as Array<
      Record<string, unknown> & { screenshot_path: string | null }
    >;

    // Mint signed URLs for screenshots (private bucket).
    const issues = await Promise.all(
      typedRows.map(async (row) => {
        let screenshotUrl: string | null = null;
        if (row.screenshot_path) {
          const { data: signed } = await sb.storage
            .from("issue-screenshots")
            .createSignedUrl(row.screenshot_path, SIGNED_URL_TTL_SECONDS);
          screenshotUrl = signed?.signedUrl ?? null;
        }
        return { ...row, screenshotUrl };
      }),
    );

    return NextResponse.json({ issues, count: issues.length });
  } catch (error) {
    return apiError(error, "Failed to fetch issues");
  }
}
