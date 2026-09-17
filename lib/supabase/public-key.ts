/**
 * Supabase public API key accessor — the new-format publishable key
 * (sb_publishable_…, not a JWT: rotatable with zero downtime, multiple keys
 * may be active at once).
 *
 * The legacy NEXT_PUBLIC_SUPABASE_ANON_KEY fallback was removed after the
 * 2026-06-11 rotation: legacy JWT keys are revoked in Supabase and deleted
 * from Vercel.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export function getSupabasePublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}
