/**
 * Admin authentication — HMAC-signed cookie session
 * gated by ADMIN_PASSWORD env var.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "admin-session";
const MAX_AGE = 60 * 60 * 24; // 24 h

export function isAdminConfigured(): boolean {
  return !!process.env.ADMIN_PASSWORD;
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  const inputBuf = Buffer.from(input);
  const expectedBuf = Buffer.from(expected);

  if (inputBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(inputBuf, expectedBuf);
}

function sign(payload: string): string {
  const secret = process.env.ADMIN_PASSWORD!;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function buildCookieValue(): string {
  const payload = `admin:${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function verifyCookieValue(value: string): boolean {
  if (!process.env.ADMIN_PASSWORD) return false;

  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1) return false;

  const payload = value.slice(0, lastDot);
  const sig = value.slice(lastDot + 1);
  const expectedSig = sign(payload);

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  const ts = parseInt(payload.split(":")[1], 10);
  if (isNaN(ts)) return false;
  return Date.now() - ts < MAX_AGE * 1000;
}

export async function setAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, buildCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function verifyAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return false;
  return verifyCookieValue(cookie.value);
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
