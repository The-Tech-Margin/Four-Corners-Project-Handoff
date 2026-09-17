/**
 * POST /api/issues — in-app issue intake.
 *
 * Authenticated creators only. The form supplies type/severity/description
 * plus auto-captured context; identity and build identity are derived here on
 * the server and never trusted from the client. Screenshots (if consented) are
 * uploaded to a private Storage bucket; the row is written with the service
 * role (the table has RLS with no client write policy).
 *
 * Rate limiting is applied centrally in proxy.ts (classifyRoute → "write").
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DEV_USER, hasDevAuthCookie } from "@/lib/dev-auth";
import { IssueReportSchema, priorityFromSeverity } from "@/lib/issue-schema";
import { apiError } from "@/lib/api-error";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

/** Max decoded screenshot size accepted server-side (defense in depth). */
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

/** Resolve the calling user from the Supabase session or the dev-auth bypass. */
async function resolveUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      return { id: data.user.id, email: data.user.email ?? null };
    }
  }

  // Dev-auth bypass (double-gated; never active in production).
  const cookieStore = await cookies();
  if (hasDevAuthCookie(cookieStore)) {
    return { id: DEV_USER.id, email: DEV_USER.email };
  }

  return null;
}

/** Decode a `data:image/...;base64,...` URL into bytes + content type. */
function decodeDataUrl(
  dataUrl: string,
): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], "base64");
    return { bytes: new Uint8Array(buffer), contentType: match[1] };
  } catch {
    return null;
  }
}

/** GET /api/issues — list the caller's own tickets (newest first). */
export async function GET() {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = getServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }
  try {
    const { data, error } = await sb
      .from("issue_reports")
      .select("id, status, type, severity, title, description, route, created_at, updated_at")
      .eq("reporter_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return apiError(error, "Failed to fetch tickets");
    return NextResponse.json({ tickets: data ?? [] });
  } catch (err) {
    return apiError(err, "Failed to fetch tickets");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = IssueReportSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const sb = getServiceClient();
    if (!sb) {
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 503 },
      );
    }

    const id = crypto.randomUUID();

    // Server-derived build identity — never trusted from the client.
    const build = {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      commitSha: process.env.NEXT_PUBLIC_COMMIT_SHA ?? null,
    };

    // Upload screenshot first (best-effort) so the row records its path.
    let screenshotPath: string | null = null;
    if (input.screenshot && input.consent_screenshot) {
      const decoded = decodeDataUrl(input.screenshot);
      if (decoded && decoded.bytes.byteLength <= MAX_SCREENSHOT_BYTES) {
        const path = `${user.id}/${id}.webp`;
        const { error: uploadError } = await sb.storage
          .from("issue-screenshots")
          .upload(path, decoded.bytes, {
            contentType: decoded.contentType,
            upsert: false,
          });
        if (!uploadError) {
          screenshotPath = path;
        } else {
          console.error("[issues] screenshot upload failed:", uploadError.message);
        }
      }
    }

    const { error: insertError } = await sb.from("issue_reports").insert({
      id,
      status: "open",
      type: input.type,
      severity: input.severity,
      // Initial workflow priority derived from severity; super-admins adjust later.
      priority: priorityFromSeverity(input.severity),
      title: input.title ?? null,
      description: input.description,
      steps: input.steps ?? null,
      extra: input.extra ?? null,
      reporter_user_id: user.id,
      reporter_email: user.email,
      url: input.url ?? null,
      route: input.route ?? null,
      referrer: input.referrer ?? null,
      app_state: input.consent_diagnostics ? input.app_state : {},
      device: input.consent_diagnostics ? input.device : {},
      build,
      diagnostics: input.consent_diagnostics ? input.diagnostics : {},
      user_agent: input.user_agent ?? null,
      screenshot_path: screenshotPath,
      consent_screenshot: input.consent_screenshot,
      consent_diagnostics: input.consent_diagnostics,
      captured_at: input.captured_at ?? null,
    });

    if (insertError) {
      return apiError(insertError, "Failed to log issue");
    }

    return NextResponse.json({ id });
  } catch (err) {
    return apiError(err, "Failed to log issue");
  }
}
