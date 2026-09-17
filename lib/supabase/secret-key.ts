/**
 * Supabase secret API key accessor (server-only) — the new-format secret key
 * (sb_secret_…, not a JWT: rotatable with zero downtime, multiple keys may be
 * active at once).
 *
 * Grants full RLS-bypass access; never expose to the client. The
 * `server-only` import makes any client-bundle inclusion a build error.
 * The legacy SUPABASE_SERVICE_ROLE_KEY fallback was removed after the
 * 2026-06-11 rotation: legacy JWT keys are revoked in Supabase and deleted
 * from Vercel. (Standalone scripts in scripts/ read the env directly —
 * `server-only` cannot be imported outside Next.js.)
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import "server-only";

export function getSupabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY;
}
