/**
 * Admin users API — role management (grant/revoke).
 * Requires admin password session OR Supabase admin role.
 * Uses service_role for mutations and auth admin API for user lookups.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin } from "@/lib/admin-roles";
import {
  grantRole,
  revokeRole,
  canManageRole,
  type AppRole,
} from "@/lib/admin-roles";
import { apiError } from "@/lib/api-error";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

const VALID_ROLES: AppRole[] = ["super_admin", "admin", "moderator"];

const VALID_PLANS = ["free", "pro", "team", "unlimited"] as const;
type Plan = (typeof VALID_PLANS)[number];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

/** GET: list ALL users with their roles and ban status */
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
    // Fetch all auth users and all role assignments in parallel
    const [{ data: authData }, { data: roles, error: rolesError }] =
      await Promise.all([
        sb.auth.admin.listUsers({ perPage: 1000, page: 1 }),
        sb
          .from("user_roles")
          .select("user_id, role")
          .order("created_at", { ascending: false }),
      ]);

    if (rolesError) throw rolesError;

    const authUsers = authData?.users ?? [];

    // Group roles by user
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUser.set(r.user_id, list);
    }

    const users = authUsers.map((u) => {
      // Supabase exposes banned_until on the user record (admin API)
      const bannedUntil = (u as { banned_until?: string | null }).banned_until ?? null;
      const isBanned =
        !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();
      return {
        id: u.id,
        email: u.email ?? "unknown",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        roles: rolesByUser.get(u.id) ?? [],
        banned: isBanned,
        banned_until: bannedUntil,
      };
    });

    // Sort: banned first, then by sign-in recency
    users.sort((a, b) => {
      if (a.banned !== b.banned) return a.banned ? -1 : 1;
      const aTime = a.last_sign_in_at
        ? new Date(a.last_sign_in_at).getTime()
        : 0;
      const bTime = b.last_sign_in_at
        ? new Date(b.last_sign_in_at).getTime()
        : 0;
      return bTime - aTime;
    });

    // Determine acting user's role
    const supabase = await createServerClient();
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    let actorRole: AppRole | null = null;
    if (currentUser) {
      const { data: currentRoles } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id);
      const list = (currentRoles ?? []).map((r) => r.role as AppRole);
      if (list.includes("super_admin")) actorRole = "super_admin";
      else if (list.includes("admin")) actorRole = "admin";
      else if (list.includes("moderator")) actorRole = "moderator";
    }

    return NextResponse.json({
      users,
      canManageRoles: actorRole === "super_admin",
      canBanUsers: actorRole === "super_admin" || actorRole === "admin",
      actor_id: currentUser?.id ?? null,
      actor_role: actorRole,
    });
  } catch (error) {
    return apiError(error, "Failed to fetch users");
  }
}

/** POST: grant or revoke a role */
export async function POST(request: NextRequest) {
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
    const { action, email, user_id, role, plan, custom_limit_bytes } =
      await request.json();

    if (
      !["grant", "revoke", "ban", "unban", "change_plan"].includes(action)
    ) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    if ((action === "grant" || action === "revoke") && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (action === "change_plan") {
      if (!VALID_PLANS.includes(plan)) {
        return NextResponse.json(
          { error: `Invalid plan: ${plan}` },
          { status: 400 },
        );
      }
      if (
        custom_limit_bytes != null &&
        (typeof custom_limit_bytes !== "number" ||
          custom_limit_bytes < 0 ||
          !Number.isFinite(custom_limit_bytes))
      ) {
        return NextResponse.json(
          { error: "custom_limit_bytes must be a non-negative number or null" },
          { status: 400 },
        );
      }
    }
    if (!email && !user_id) {
      return NextResponse.json({ error: "email or user_id required" }, { status: 400 });
    }

    // Get acting user's highest role for permission check
    const supabase = await createServerClient();
    const { data: { user: actingUser } } = await supabase.auth.getUser();
    let actorRole: AppRole | null = null;

    if (actingUser) {
      const { data: actorRoles } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", actingUser.id);
      const roles = (actorRoles ?? []).map((r) => r.role as AppRole);
      if (roles.includes("super_admin")) actorRole = "super_admin";
      else if (roles.includes("admin")) actorRole = "admin";
      else if (roles.includes("moderator")) actorRole = "moderator";
    }

    // Resolve email to user_id if needed
    let targetUserId = user_id;
    if (!targetUserId && email) {
      const { data: authData } = await sb.auth.admin.listUsers({ perPage: 1000, page: 1 });
      const found = authData?.users?.find((u) => u.email === email);
      if (!found) {
        return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 });
      }
      targetUserId = found.id;
    }

    // Role grant/revoke — super_admin only
    if (action === "grant" || action === "revoke") {
      if (!actorRole || !canManageRole(actorRole, role as AppRole)) {
        return NextResponse.json(
          { error: `Only developers can ${action} roles` },
          { status: 403 },
        );
      }
      if (action === "grant") {
        await grantRole(targetUserId, role as AppRole, actingUser?.id);
        return NextResponse.json({ ok: true, action: "granted", user_id: targetUserId, role });
      }
      await revokeRole(targetUserId, role as AppRole);
      return NextResponse.json({ ok: true, action: "revoked", user_id: targetUserId, role });
    }

    // Ban / unban — admins can ban users with strictly lower roles
    if (action === "ban" || action === "unban") {
      if (actorRole !== "admin" && actorRole !== "super_admin") {
        return NextResponse.json(
          { error: "Only admins can manage user access" },
          { status: 403 },
        );
      }

      // No self-ban
      if (targetUserId === actingUser?.id) {
        return NextResponse.json(
          { error: "You cannot ban yourself" },
          { status: 400 },
        );
      }

      // Look up target's roles
      const { data: targetRolesData } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId);
      const targetRoles = (targetRolesData ?? []).map(
        (r) => r.role as AppRole,
      );

      const isTargetSuperAdmin = targetRoles.includes("super_admin");
      const isTargetAdmin = targetRoles.includes("admin");

      // Admins cannot ban other admins or super_admins.
      // Super_admins can ban admins but not other super_admins.
      if (isTargetSuperAdmin) {
        return NextResponse.json(
          { error: "Cannot ban a developer" },
          { status: 403 },
        );
      }
      if (isTargetAdmin && actorRole !== "super_admin") {
        return NextResponse.json(
          { error: "Only developers can ban other admins" },
          { status: 403 },
        );
      }

      // Supabase ban: 100 years for permanent, "none" to lift
      const banDuration = action === "ban" ? "876000h" : "none";
      const { error: banError } = await sb.auth.admin.updateUserById(
        targetUserId,
        { ban_duration: banDuration },
      );
      if (banError) {
        return NextResponse.json({ error: banError.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        action,
        user_id: targetUserId,
      });
    }

    // Change plan — super_admin only (same gate as role management).
    if (action === "change_plan") {
      if (actorRole !== "super_admin") {
        return NextResponse.json(
          { error: "Only developers can change storage plans" },
          { status: 403 },
        );
      }

      // Upsert: create the row if missing, update otherwise.
      const { error: planError } = await sb
        .from("user_plans")
        .upsert(
          {
            user_id: targetUserId,
            plan: plan as Plan,
            custom_limit_bytes: custom_limit_bytes ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (planError) {
        return NextResponse.json(
          { error: planError.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        action: "change_plan",
        user_id: targetUserId,
        plan,
        custom_limit_bytes: custom_limit_bytes ?? null,
      });
    }

    return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
  } catch (error) {
    return apiError(error, "Failed to manage user");
  }
}
