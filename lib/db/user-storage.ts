/**
 * Per-user storage usage + quota helpers.
 *
 * Usage is the SUM of `user_assets.file_size` scoped to the current user.
 * RLS on `user_assets` already restricts SELECT to the signed-in user, so we
 * don't filter by user_id in client queries — the DB enforces it.
 *
 * Quota is derived from the user's row in `user_plans` (migration 039). The
 * plan → bytes mapping lives in `lib/upload-limits.ts::PLAN_QUOTAS` so we
 * can retune limits without touching any rows.
 */

import { createClient } from "@/lib/supabase/client";
import { PLAN_QUOTAS, resolvePlanLimit } from "@/lib/upload-limits";

export interface UserQuota {
  used: number;
  limit: number;
  plan: string;
  /** used / limit, clamped to [0, 1]. Convenience for UI. */
  ratio: number;
}

/**
 * SUM(user_assets.file_size) for the current user. RLS scopes it.
 * Returns 0 when no rows, no client, or on error (fail-open — never block
 * uploads because of a usage lookup failure).
 */
export async function getUserStorageUsage(userId: string): Promise<number> {
  const supabase = createClient();
  if (!supabase) return 0;

  // Use an aggregate HEAD call via PostgREST. Supabase-js exposes this as
  // `.select('file_size')` + client-side sum, which is cheap given the
  // indexed user filter on user_assets.
  const { data, error } = await supabase
    .from("user_assets")
    .select("file_size")
    .eq("user_id", userId);

  if (error || !data) return 0;

  let total = 0;
  for (const row of data as { file_size: number | null }[]) {
    total += row.file_size ?? 0;
  }
  return total;
}

/**
 * Read the user's plan row. Falls back to `{ plan: 'free', customLimit: null }`
 * when no row exists (we lazy-create plans on first quota check by treating
 * missing rows as the default free tier).
 */
export async function getUserPlan(
  userId: string,
): Promise<{ plan: string; customLimit: number | null }> {
  const supabase = createClient();
  if (!supabase) return { plan: "free", customLimit: null };

  const { data, error } = await supabase
    .from("user_plans")
    .select("plan, custom_limit_bytes")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { plan: "free", customLimit: null };
  return {
    plan: data.plan as string,
    customLimit: (data.custom_limit_bytes as number | null) ?? null,
  };
}

/**
 * One-shot: current usage + plan + effective limit. Used by the
 * StorageUsageBadge and as the second stage of `checkQuotaForUpload`.
 */
export async function getUserQuota(userId: string): Promise<UserQuota> {
  const [used, { plan, customLimit }] = await Promise.all([
    getUserStorageUsage(userId),
    getUserPlan(userId),
  ]);
  const limit = resolvePlanLimit(plan, customLimit);
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  return { used, limit, plan, ratio };
}

/**
 * Pre-flight check used by upload paths. Returns `{ ok: true }` if the
 * incoming bytes would fit; otherwise the current usage + limit + plan so
 * the caller can fire a helpful toast.
 */
export async function checkQuotaForUpload(
  userId: string,
  incomingBytes: number,
): Promise<
  | { ok: true }
  | { ok: false; used: number; limit: number; plan: string }
> {
  // Short-circuit: zero bytes can't exceed any quota.
  if (incomingBytes <= 0) return { ok: true };

  const { used, limit, plan } = await getUserQuota(userId);
  if (used + incomingBytes <= limit) return { ok: true };
  return { ok: false, used, limit, plan };
}

// Re-export for convenience so callers can just import from this module.
export { PLAN_QUOTAS };
