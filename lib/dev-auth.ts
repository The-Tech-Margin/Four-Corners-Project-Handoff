/**
 * Dev-only authentication bypass.
 * When DEV_AUTH_COOKIE is present, the app treats the user as logged in
 * with a mock user — no Supabase credentials required.
 *
 * SECURITY: Requires BOTH conditions to activate:
 *   1. NODE_ENV === "development"
 *   2. NEXT_PUBLIC_DEV_AUTH_ENABLED === "true" (explicit opt-in)
 *
 * This double-gate prevents accidental activation if a deployment
 * misconfigures NODE_ENV. The env var is never set in CI/production.
 */

export const DEV_AUTH_COOKIE = "dev-auth-user";

export const DEV_USER = {
  id: "dev-local-user-00000000-0000-0000-0000-000000000000",
  email: "dev@localhost",
  app_metadata: {},
  user_metadata: { full_name: "Dev User" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as const;

/**
 * Double-gate check: dev auth only available when BOTH
 * NODE_ENV=development AND NEXT_PUBLIC_DEV_AUTH_ENABLED=true.
 */
export function isDevAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED === "true"
  );
}

/** Check if a cookie map contains the dev auth cookie */
export function hasDevAuthCookie(cookies: { get: (name: string) => any }): boolean {
  if (!isDevAuthEnabled()) return false;
  const cookie = cookies.get(DEV_AUTH_COOKIE);
  return cookie?.value === "true" || cookie === "true";
}

/** Client-side check — reads document.cookie */
export function isDevAuthClient(): boolean {
  if (typeof document === "undefined") return false;
  if (process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED !== "true") return false;
  return document.cookie.includes(`${DEV_AUTH_COOKIE}=true`);
}
