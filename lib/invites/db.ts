/**
 * Invite DB helpers — service-role only.
 * All callers must be server-side routes that have already authenticated
 * the request (or are intentionally public, like POST /api/invites/request).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

export type InviteStatus =
  | "pending"
  | "approved"
  | "denied"
  | "accepted"
  | "revoked";

export interface InviteRow {
  id: string;
  email: string;
  full_name: string;
  organization: string | null;
  status: InviteStatus;
  invite_token: string | null;
  token_expires_at: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_by: string | null;
  accepted_user_id: string | null;
  notes: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: SupabaseClient<any, any, any> | null = null;

export function getInviteServiceClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

/**
 * Look up an active (pending | approved) invite by lowercase email.
 * Returns null if no such row exists.
 */
export async function findActiveInviteByEmail(
  email: string,
): Promise<InviteRow | null> {
  const sb = getInviteServiceClient();
  if (!sb) return null;
  const { data } = await sb
    .from("user_invites")
    .select("*")
    .eq("email", email.toLowerCase())
    .in("status", ["pending", "approved", "accepted"])
    .maybeSingle();
  return (data as InviteRow | null) ?? null;
}

export async function getInviteByToken(
  token: string,
): Promise<InviteRow | null> {
  const sb = getInviteServiceClient();
  if (!sb) return null;
  const { data } = await sb
    .from("user_invites")
    .select("*")
    .eq("invite_token", token)
    .maybeSingle();
  return (data as InviteRow | null) ?? null;
}

export async function getInviteById(id: string): Promise<InviteRow | null> {
  const sb = getInviteServiceClient();
  if (!sb) return null;
  const { data } = await sb
    .from("user_invites")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as InviteRow | null) ?? null;
}

export async function isExistingAuthUser(email: string): Promise<boolean> {
  const sb = getInviteServiceClient();
  if (!sb) return false;
  // Listing with perPage=1000 is what the admin users route does — fine here
  // for the foreseeable user count. Replace with a single-lookup RPC if/when
  // the user base outgrows it.
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000, page: 1 });
  const target = email.toLowerCase();
  return (data?.users ?? []).some((u) => u.email?.toLowerCase() === target);
}
