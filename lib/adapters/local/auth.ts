/**
 * Local auth: accounts in a JSON collection, scrypt password hashes and a
 * signed session cookie. Reset links are delivered through the email port,
 * which prints them to the server console by default.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import type {
  AuthPort,
  AuthResult,
  CookieMutation,
  CookieReader,
  SessionUser,
} from "@/lib/ports/auth";
import { SESSION_COOKIE } from "@/lib/ports/auth";
import type { EmailPort } from "@/lib/ports/email";
import {
  hashPassword,
  isAcceptablePassword,
  verifyPassword,
} from "@/lib/security/password";
import { createSessionToken, readSessionToken } from "@/lib/security/session-token";
import { JsonStore } from "./json-store";

interface AccountRow {
  id: string;
  email: string;
  passwordHash: string;
  sessionVersion: number;
  createdAt: string;
}

interface ResetRow {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const toSessionUser = (row: AccountRow): SessionUser => ({
  id: row.id,
  email: row.email,
  createdAt: row.createdAt,
});

export interface LocalAuthOptions {
  dataDir: string;
  sessionSecret: string;
  signupsEnabled: boolean;
  secureCookies: boolean;
  email: EmailPort;
}

export function createLocalAuth(options: LocalAuthOptions): AuthPort {
  const accounts = new JsonStore<AccountRow>(options.dataDir, "users");
  const resets = new JsonStore<ResetRow>(options.dataDir, "reset-tokens");

  function sessionCookie(row: AccountRow): CookieMutation {
    return {
      name: SESSION_COOKIE,
      value: createSessionToken(
        { userId: row.id, sessionVersion: row.sessionVersion, ttlSeconds: SESSION_TTL_SECONDS },
        options.sessionSecret,
      ),
      maxAge: SESSION_TTL_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      secure: options.secureCookies,
      path: "/",
    };
  }

  return {
    capabilities: { signUp: options.signupsEnabled, passwordReset: true },

    async getSessionUser(cookies: CookieReader) {
      const payload = readSessionToken(cookies.get(SESSION_COOKIE), options.sessionSecret);
      if (!payload) return null;

      const row = accounts.read().find((account) => account.id === payload.uid);
      // A password change bumps sessionVersion, which retires older cookies.
      if (!row || row.sessionVersion !== payload.sv) return null;
      return toSessionUser(row);
    },

    async peekSession(cookieValue) {
      const payload = readSessionToken(cookieValue, options.sessionSecret);
      return payload ? { userId: payload.uid } : null;
    },

    async signUp({ email, password }): Promise<AuthResult> {
      if (!options.signupsEnabled) {
        return {
          ok: false,
          code: "SIGNUPS_DISABLED",
          message: "This deployment does not accept new accounts.",
        };
      }
      const address = normalizeEmail(email);
      if (!EMAIL_PATTERN.test(address)) {
        return { ok: false, code: "INVALID_EMAIL", message: "Enter a valid email address." };
      }
      if (!isAcceptablePassword(password)) {
        return {
          ok: false,
          code: "WEAK_PASSWORD",
          message: "Use a password of at least 8 characters.",
        };
      }

      const passwordHash = await hashPassword(password);
      const row = await accounts.mutate((rows) => {
        if (rows.some((account) => account.email === address)) return { rows, result: null };
        const created: AccountRow = {
          id: randomUUID(),
          email: address,
          passwordHash,
          sessionVersion: 1,
          createdAt: new Date().toISOString(),
        };
        return { rows: [...rows, created], result: created };
      });

      if (!row) {
        return {
          ok: false,
          code: "EMAIL_TAKEN",
          message: "An account already exists for that address.",
        };
      }
      return { ok: true, user: toSessionUser(row), cookies: [sessionCookie(row)] };
    },

    async signIn({ email, password }): Promise<AuthResult> {
      const address = normalizeEmail(email);
      const row = accounts.read().find((account) => account.email === address);
      const stored = row?.passwordHash ?? (await hashPassword(randomBytes(16).toString("hex")));
      const valid = await verifyPassword(password, stored);

      if (!row || !valid) {
        return {
          ok: false,
          code: "INVALID_CREDENTIALS",
          message: "That email and password do not match.",
        };
      }
      return { ok: true, user: toSessionUser(row), cookies: [sessionCookie(row)] };
    },

    async signOut() {
      return [
        {
          name: SESSION_COOKIE,
          value: "",
          maxAge: 0,
          httpOnly: true,
          sameSite: "lax",
          secure: options.secureCookies,
          path: "/",
        },
      ];
    },

    async requestPasswordReset(email, ctx) {
      const address = normalizeEmail(email);
      const row = accounts.read().find((account) => account.email === address);
      if (!row) return; // Same outcome either way: no account enumeration.

      const token = randomBytes(32).toString("base64url");
      await resets.mutate((rows) => {
        const live = rows.filter(
          (reset) => !reset.usedAt && new Date(reset.expiresAt).getTime() > Date.now(),
        );
        return {
          rows: [
            ...live,
            {
              tokenHash: hashToken(token),
              userId: row.id,
              expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
              usedAt: null,
            },
          ],
          result: undefined,
        };
      });

      const url = ctx.resetUrl(token);
      await options.email.send({
        to: row.email,
        subject: "Reset your Four Corners password",
        html: `<p>Use the link below within the hour to set a new password.</p><p><a href="${url}">${url}</a></p>`,
        text: `Set a new password within the hour: ${url}`,
      });
    },

    async consumePasswordReset({ token, password }): Promise<AuthResult> {
      if (!isAcceptablePassword(password)) {
        return {
          ok: false,
          code: "WEAK_PASSWORD",
          message: "Use a password of at least 8 characters.",
        };
      }

      const tokenHash = hashToken(token);
      const userId = await resets.mutate((rows) => {
        const index = rows.findIndex(
          (reset) =>
            reset.tokenHash === tokenHash &&
            !reset.usedAt &&
            new Date(reset.expiresAt).getTime() > Date.now(),
        );
        if (index === -1) return { rows, result: null };
        const next = [...rows];
        next[index] = { ...next[index], usedAt: new Date().toISOString() };
        return { rows: next, result: next[index].userId };
      });

      if (!userId) {
        return {
          ok: false,
          code: "INVALID_TOKEN",
          message: "That reset link has expired or was already used.",
        };
      }

      const passwordHash = await hashPassword(password);
      const row = await accounts.mutate((rows) => {
        const index = rows.findIndex((account) => account.id === userId);
        if (index === -1) return { rows, result: null };
        const next = [...rows];
        // Bumping the version signs out sessions issued before the reset.
        next[index] = {
          ...next[index],
          passwordHash,
          sessionVersion: next[index].sessionVersion + 1,
        };
        return { rows: next, result: next[index] };
      });

      if (!row) {
        return { ok: false, code: "INVALID_TOKEN", message: "That account no longer exists." };
      }
      return { ok: true, user: toSessionUser(row), cookies: [sessionCookie(row)] };
    },
  };
}
