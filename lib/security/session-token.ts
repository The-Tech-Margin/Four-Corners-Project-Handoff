/**
 * Signed session tokens: base64url(payload).base64url(HMAC-SHA256).
 * Stateless, so the proxy can check one without touching the data store;
 * `sessionVersion` lets a password change invalidate tokens already issued.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  /** User id. */
  uid: string;
  /** Session version at issue time. */
  sv: number;
  /** Issued at (epoch seconds). */
  iat: number;
  /** Expires at (epoch seconds). */
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(
  input: { userId: string; sessionVersion: number; ttlSeconds: number },
  secret: string,
  now: number = Date.now(),
): string {
  const issued = Math.floor(now / 1000);
  const payload: SessionPayload = {
    uid: input.userId,
    sv: input.sessionVersion,
    iat: issued,
    exp: issued + input.ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

/** Verify signature and expiry. Returns null for anything malformed. */
export function readSessionToken(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = Buffer.from(sign(encoded, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload?.uid !== "string" || typeof payload?.exp !== "number") return null;
  if (payload.exp * 1000 <= now) return null;
  return payload;
}
