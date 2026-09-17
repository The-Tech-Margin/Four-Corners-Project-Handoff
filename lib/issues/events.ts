/**
 * Ticket event log helpers — append-only history for issue tickets.
 *
 * Every reporter or admin update writes one row to `issue_report_events`
 * (migration 050) so ticket history is preserved additively. Writes use the
 * service role (the table has RLS with no client write policy).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

/** Service-role client (bypasses RLS). Returns null if env is unconfigured. */
export function getIssueServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

export type IssueEventKind =
  | "comment"
  | "status"
  | "assignment"
  | "priority"
  | "resolution"
  | "edit";

export interface AppendEventParams {
  reportId: string;
  authorUserId: string | null;
  authorKind: "reporter" | "admin";
  kind: IssueEventKind;
  body?: string | null;
  /** Field diffs, e.g. { status: { from: "open", to: "resolved" } }. */
  changes?: Record<string, unknown> | null;
}

/** Append a single event row. Best-effort: logs and swallows errors. */
export async function appendIssueEvent(
  sb: SupabaseClient,
  params: AppendEventParams,
): Promise<void> {
  const { error } = await sb.from("issue_report_events").insert({
    report_id: params.reportId,
    author_user_id: params.authorUserId,
    author_kind: params.authorKind,
    kind: params.kind,
    body: params.body ?? null,
    changes: params.changes ?? null,
  });
  if (error) {
    console.error("[issues] failed to append event:", error.message);
  }
}
