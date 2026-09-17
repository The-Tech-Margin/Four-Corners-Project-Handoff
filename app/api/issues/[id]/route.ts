/**
 * Reporter ticket API — a signed-in reporter views and updates their OWN ticket.
 *
 *  GET   — the ticket + its event thread (only if the caller is the reporter).
 *  PATCH — add a comment and/or edit user-facing fields (type, severity, title,
 *          description, steps). Edits update the row AND append an `edit` event
 *          capturing the prior values, so history is preserved additively.
 *
 * Triage fields (status/assignee/priority/resolution) are NOT editable here —
 * those are super-admin-only via /api/admin/issues/[id].
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DEV_USER, hasDevAuthCookie } from "@/lib/dev-auth";
import { apiError } from "@/lib/api-error";
import { getIssueServiceClient, appendIssueEvent } from "@/lib/issues/events";
import { ReporterUpdateSchema } from "@/lib/issue-triage-schema";

type RouteContext = { params: Promise<{ id: string }> };

/** Resolve the calling user from the Supabase session or the dev-auth bypass. */
async function resolveUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data?.user) return { id: data.user.id, email: data.user.email ?? null };
  }
  const cookieStore = await cookies();
  if (hasDevAuthCookie(cookieStore)) return { id: DEV_USER.id, email: DEV_USER.email };
  return null;
}

const REPORTER_FIELDS = ["type", "severity", "title", "description", "steps"] as const;

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const user = await resolveUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getIssueServiceClient();
  if (!sb) return NextResponse.json({ error: "Service not configured" }, { status: 503 });

  const { id } = await ctx.params;
  try {
    const { data: issue, error } = await sb
      .from("issue_reports")
      .select(
        "id, status, type, severity, title, description, steps, reporter_user_id, " +
          "reporter_email, url, route, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return apiError(error, "Failed to fetch ticket");
    if (!issue || (issue as unknown as { reporter_user_id: string }).reporter_user_id !== user.id) {
      // Don't reveal existence of other users' tickets.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: events } = await sb
      .from("issue_report_events")
      .select("id, author_kind, kind, body, changes, created_at")
      .eq("report_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({ issue, events: events ?? [] });
  } catch (err) {
    return apiError(err, "Failed to fetch ticket");
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await resolveUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getIssueServiceClient();
  if (!sb) return NextResponse.json({ error: "Service not configured" }, { status: 503 });

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = ReporterUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  try {
    const { data: current, error: fetchErr } = await sb
      .from("issue_reports")
      .select("id, reporter_user_id, type, severity, title, description, steps")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return apiError(fetchErr, "Failed to load ticket");
    if (!current || (current as unknown as { reporter_user_id: string }).reporter_user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const cur = current as Record<string, unknown>;

    // Field edits → update row + record prior values in an `edit` event.
    if (input.edit) {
      const update: Record<string, unknown> = {};
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const f of REPORTER_FIELDS) {
        const next = (input.edit as Record<string, unknown>)[f];
        if (next !== undefined && next !== cur[f]) {
          update[f] = next;
          changes[f] = { from: cur[f] ?? null, to: next };
        }
      }
      if (Object.keys(update).length > 0) {
        const { error: updErr } = await sb.from("issue_reports").update(update).eq("id", id);
        if (updErr) return apiError(updErr, "Failed to update ticket");
        await appendIssueEvent(sb, {
          reportId: id,
          authorUserId: user.id,
          authorKind: "reporter",
          kind: "edit",
          changes,
        });
      }
    }

    if (input.comment) {
      await appendIssueEvent(sb, {
        reportId: id,
        authorUserId: user.id,
        authorKind: "reporter",
        kind: "comment",
        body: input.comment,
      });
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return apiError(err, "Failed to update ticket");
  }
}
