/**
 * Invite token generation — 32 random bytes, base64url-encoded.
 * Stored in DB; lookup happens via `getInviteByToken`.
 */

export const INVITE_TOKEN_TTL_DAYS = 7;

export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function inviteTokenExpiresAt(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + INVITE_TOKEN_TTL_DAYS);
  return d.toISOString();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
