/**
 * Admin ticket triage API — super-admin status/ownership updates.
 *
 *  GET   — one ticket + its event thread + a signed screenshot URL.
 *  PATCH — super-admin only: update status / priority / assignee / resolution
 *          (and/or add a comment). Each change is appended to
 *          issue_report_events (additive history). Reaching a resolving status
 *          stamps resolved_at + reviewed_by and deletes the private screenshot.
 *
 * Auth: admin-password session OR Supabase super_admin role. Reads are allowed
 * for any admin (mirrors the list route); writes require super-admin.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin, isCurrentUserSuperAdmin } from "@/lib/admin-roles";
import { apiError } from "@/lib/api-error";
import {
  getIssueServiceClient,
  appendIssueEvent,
  type IssueEventKind,
} from "@/lib/issues/events";
import {
  TriageSchema,
  RESOLVING_STATUSES,
  type IssueStatus,
} from "@/lib/issue-triage-schema";

type RouteContext = { params: Promise<{ id: string }> };

const SIGNED_URL_TTL_SECONDS = 300;

/** Acting Supabase user id (null under password-only admin session). */
async function actorId(): Promise<string | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const [hasPasswordSession, hasDbRole] = await Promise.all([
    verifyAdminSession(),
    isCurrentUserAdmin(),
  ]);
  if (!hasPasswordSession && !hasDbRole) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getIssueServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const { id } = await ctx.params;
  try {
    const { data: issue, error } = await sb
      .from("issue_reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return apiError(error, "Failed to fetch ticket");
    if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: events } = await sb
      .from("issue_report_events")
      .select("*")
      .eq("report_id", id)
      .order("created_at", { ascending: true });

    let screenshotUrl: string | null = null;
    const path = (issue as { screenshot_path?: string | null }).screenshot_path;
    if (path) {
      const { data: signed } = await sb.storage
        .from("issue-screenshots")
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      screenshotUrl = signed?.signedUrl ?? null;
    }

    return NextResponse.json({ issue, events: events ?? [], screenshotUrl });
  } catch (err) {
    return apiError(err, "Failed to fetch ticket");
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  // Reads need any admin; triage WRITES require super-admin (or the password
  // session, which is the master-key admin).
  const [hasPasswordSession, isSuper] = await Promise.all([
    verifyAdminSession(),
    isCurrentUserSuperAdmin(),
  ]);
  if (!hasPasswordSession && !isSuper) {
    return NextResponse.json(
      { error: "Only developers can triage tickets" },
      { status: hasPasswordSession || (await isCurrentUserAdmin()) ? 403 : 401 },
    );
  }

  const sb = getIssueServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = TriageSchema.safeParse(json);
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
      .select("id, status, type, priority, resolution, assignee, screenshot_path")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return apiError(fetchErr, "Failed to load ticket");
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const cur = current as {
      status: IssueStatus;
      type: string;
      priority: number | null;
      resolution: string | null;
      assignee: string | null;
      screenshot_path: string | null;
    };

    const me = await actorId();
    const update: Record<string, unknown> = {};
    const events: Array<{ kind: IssueEventKind; changes: Record<string, unknown> }> = [];

    if (input.status !== undefined && input.status !== cur.status) {
      update.status = input.status;
      events.push({ kind: "status", changes: { status: { from: cur.status, to: input.status } } });
    }
    if (input.type !== undefined && input.type !== cur.type) {
      // Logged as "edit" — the events CHECK constraint (migration 050) has no
      // dedicated "type" kind, and a classification fix is an edit anyway.
      update.type = input.type;
      events.push({ kind: "edit", changes: { type: { from: cur.type, to: input.type } } });
    }
    if (input.priority !== undefined && input.priority !== cur.priority) {
      update.priority = input.priority;
      events.push({ kind: "priority", changes: { priority: { from: cur.priority, to: input.priority } } });
    }
    if (input.resolution !== undefined && input.resolution !== cur.resolution) {
      update.resolution = input.resolution;
      events.push({ kind: "resolution", changes: { resolution: { from: cur.resolution, to: input.resolution } } });
    }
    if (input.assignee !== undefined) {
      const next = input.assignee === "me" ? me : input.assignee;
      if (next !== cur.assignee) {
        update.assignee = next;
        events.push({ kind: "assignment", changes: { assignee: { from: cur.assignee, to: next } } });
      }
    }

    // Resolving transition: stamp reviewer + time and delete the screenshot.
    const nextStatus = (update.status as IssueStatus) ?? cur.status;
    const becameResolved =
      update.status !== undefined && RESOLVING_STATUSES.includes(nextStatus);
    if (becameResolved) {
      update.resolved_at = new Date().toISOString();
      update.reviewed_by = me;
      if (cur.screenshot_path) {
        const { error: rmErr } = await sb.storage
          .from("issue-screenshots")
          .remove([cur.screenshot_path]);
        if (rmErr) {
          console.error("[issues] screenshot delete failed:", rmErr.message);
        } else {
          update.screenshot_path = null;
        }
      }
    }

    if (Object.keys(update).length > 0) {
      const { error: updErr } = await sb.from("issue_reports").update(update).eq("id", id);
      if (updErr) return apiError(updErr, "Failed to update ticket");
    }

    // Append one event per changed field, plus an optional comment.
    for (const e of events) {
      await appendIssueEvent(sb, {
        reportId: id,
        authorUserId: me,
        authorKind: "admin",
        kind: e.kind,
        changes: e.changes,
      });
    }
    if (input.comment) {
      await appendIssueEvent(sb, {
        reportId: id,
        authorUserId: me,
        authorKind: "admin",
        kind: "comment",
        body: input.comment,
      });
    }

    return NextResponse.json({ ok: true, id, updated: Object.keys(update) });
  } catch (err) {
    return apiError(err, "Failed to triage ticket");
  }
}
