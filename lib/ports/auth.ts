/**
 * Auth port: accounts, sessions and password resets.
 *
 * Sessions are carried in cookies the adapter mints, so the proxy can check
 * one cheaply (`peekSession`) while route handlers use the authoritative
 * `getSessionUser`.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export interface SessionUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface CookieReader {
  get(name: string): string | undefined;
}

export interface CookieMutation {
  name: string;
  value: string;
  maxAge: number;
  httpOnly: boolean;
  sameSite: "lax" | "strict";
  secure: boolean;
  path: string;
}

export type AuthFailureCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_TAKEN"
  | "WEAK_PASSWORD"
  | "INVALID_EMAIL"
  | "INVALID_TOKEN"
  | "SIGNUPS_DISABLED";

export type AuthResult =
  | { ok: true; user: SessionUser; cookies: CookieMutation[] }
  | { ok: false; code: AuthFailureCode; message: string };

export const SESSION_COOKIE = "fc_session";

export interface AuthPort {
  readonly capabilities: { signUp: boolean; passwordReset: boolean };
  /** Authoritative: signature, expiry and revocation. */
  getSessionUser(cookies: CookieReader): Promise<SessionUser | null>;
  /** Signature and expiry only — safe for the proxy, never touches storage. */
  peekSession(cookieValue: string | undefined): Promise<{ userId: string } | null>;
  signUp(input: { email: string; password: string }): Promise<AuthResult>;
  signIn(input: { email: string; password: string }): Promise<AuthResult>;
  signOut(): Promise<CookieMutation[]>;
  /**
   * Always resolves, whether or not the address has an account, so the
   * response cannot be used to enumerate users.
   */
  requestPasswordReset(
    email: string,
    ctx: { resetUrl: (token: string) => string },
  ): Promise<void>;
  consumePasswordReset(input: { token: string; password: string }): Promise<AuthResult>;
}
