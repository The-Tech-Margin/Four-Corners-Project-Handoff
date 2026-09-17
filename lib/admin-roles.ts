/**
 * Admin role helpers — check if the current Supabase user has an elevated role.
 * All mutations go through service_role; reads use the user's own session
 * (RLS policy lets users read their own rows).
 *
 * Role hierarchy: super_admin > admin > moderator
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

export type AppRole = "super_admin" | "admin" | "moderator";

/** Ordered from highest to lowest privilege */
const ROLE_HIERARCHY: AppRole[] = ["super_admin", "admin", "moderator"];

/** Service-role client (bypasses RLS) — server-only */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) throw new Error("Missing Supabase service-role config");
  return createServiceClient(url, key);
}

/**
 * Check if the currently-authenticated Supabase user has a given role.
 * Uses the user's own session (RLS: users can read own roles).
 */
export async function currentUserHasRole(role: AppRole): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", role)
    .maybeSingle();

  return !!data;
}

/** Check if current user is admin or super_admin */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "super_admin"]);

  return (data ?? []).length > 0;
}

/** Check if current user is super_admin */
export async function isCurrentUserSuperAdmin(): Promise<boolean> {
  return currentUserHasRole("super_admin");
}

/**
 * Get the current user's highest role, or null if no roles.
 */
export async function currentUserHighestRole(): Promise<AppRole | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (!data || data.length === 0) return null;

  const roles = data.map((r: { role: string }) => r.role as AppRole);
  for (const level of ROLE_HIERARCHY) {
    if (roles.includes(level)) return level;
  }
  return null;
}

/**
 * Check if a role can be managed by an actor with the given role.
 * Only super_admin can grant/revoke any role. No one else can elevate privileges.
 */
export function canManageRole(actorRole: AppRole, _targetRole: AppRole): boolean {
  return actorRole === "super_admin";
}

/**
 * Grant a role to a user (service_role only — call from admin API routes).
 */
export async function grantRole(
  userId: string,
  role: AppRole,
  grantedBy?: string,
) {
  const sb = getServiceClient();
  const { error } = await sb.from("user_roles").upsert(
    { user_id: userId, role, granted_by: grantedBy ?? null },
    { onConflict: "user_id,role" },
  );
  if (error) throw error;
}

/**
 * Revoke a role from a user (service_role only).
 */
export async function revokeRole(userId: string, role: AppRole) {
  const sb = getServiceClient();
  const { error } = await sb
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role);
  if (error) throw error;
}

/**
 * Get all admins (service_role — returns user_id only, no PII).
 */
export async function getAdminUserIds(): Promise<string[]> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "super_admin"]);
  return (data ?? []).map((r) => r.user_id);
}
