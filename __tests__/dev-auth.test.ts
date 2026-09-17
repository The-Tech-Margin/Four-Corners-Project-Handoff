/**
 * Dev Auth Security Tests
 *
 * Verifies the double-gate mechanism prevents dev auth from activating
 * in production or misconfigured environments.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We need to re-import after each env change, so use dynamic imports
async function loadDevAuth() {
  // Clear module cache so env changes take effect
  vi.resetModules();
  return import("@/lib/dev-auth");
}

describe("dev-auth security", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  describe("isDevAuthEnabled()", () => {
    it("returns false in production even if DEV_AUTH env var is set", async () => {
      (process.env as any).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "true";
      const { isDevAuthEnabled } = await loadDevAuth();
      expect(isDevAuthEnabled()).toBe(false);
    });

    it("returns false in development without explicit opt-in env var", async () => {
      (process.env as any).NODE_ENV = "development";
      delete process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED;
      const { isDevAuthEnabled } = await loadDevAuth();
      expect(isDevAuthEnabled()).toBe(false);
    });

    it("returns false when env var is a truthy-but-wrong value", async () => {
      (process.env as any).NODE_ENV = "development";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "1";
      const { isDevAuthEnabled } = await loadDevAuth();
      expect(isDevAuthEnabled()).toBe(false);
    });

    it("returns false when env var is empty string", async () => {
      (process.env as any).NODE_ENV = "development";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "";
      const { isDevAuthEnabled } = await loadDevAuth();
      expect(isDevAuthEnabled()).toBe(false);
    });

    it("returns true ONLY when both gates pass", async () => {
      (process.env as any).NODE_ENV = "development";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "true";
      const { isDevAuthEnabled } = await loadDevAuth();
      expect(isDevAuthEnabled()).toBe(true);
    });

    it("returns false in test environment", async () => {
      (process.env as any).NODE_ENV = "test";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "true";
      const { isDevAuthEnabled } = await loadDevAuth();
      expect(isDevAuthEnabled()).toBe(false);
    });
  });

  describe("hasDevAuthCookie()", () => {
    it("returns false in production even with cookie present", async () => {
      (process.env as any).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "true";
      const { hasDevAuthCookie } = await loadDevAuth();
      const mockCookies = { get: (name: string) => ({ value: "true" }) };
      expect(hasDevAuthCookie(mockCookies)).toBe(false);
    });

    it("returns false without env var even with cookie present", async () => {
      (process.env as any).NODE_ENV = "development";
      delete process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED;
      const { hasDevAuthCookie } = await loadDevAuth();
      const mockCookies = { get: (name: string) => ({ value: "true" }) };
      expect(hasDevAuthCookie(mockCookies)).toBe(false);
    });

    it("returns false when cookie is missing", async () => {
      (process.env as any).NODE_ENV = "development";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "true";
      const { hasDevAuthCookie } = await loadDevAuth();
      const mockCookies = { get: (name: string) => undefined };
      expect(hasDevAuthCookie(mockCookies)).toBe(false);
    });

    it("returns false when cookie value is not 'true'", async () => {
      (process.env as any).NODE_ENV = "development";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "true";
      const { hasDevAuthCookie } = await loadDevAuth();
      const mockCookies = { get: (name: string) => ({ value: "false" }) };
      expect(hasDevAuthCookie(mockCookies)).toBe(false);
    });

    it("returns true only with both gates AND valid cookie", async () => {
      (process.env as any).NODE_ENV = "development";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "true";
      const { hasDevAuthCookie } = await loadDevAuth();
      const mockCookies = { get: (name: string) => ({ value: "true" }) };
      expect(hasDevAuthCookie(mockCookies)).toBe(true);
    });
  });

  describe("DEV_USER constants", () => {
    it("has a non-empty mock user ID", async () => {
      const { DEV_USER } = await loadDevAuth();
      expect(DEV_USER.id).toBeTruthy();
      expect(typeof DEV_USER.id).toBe("string");
    });

    it("has a non-empty email", async () => {
      const { DEV_USER } = await loadDevAuth();
      expect(DEV_USER.email).toBeTruthy();
    });

    it("uses localhost domain for email (not a real domain)", async () => {
      const { DEV_USER } = await loadDevAuth();
      expect(DEV_USER.email).toContain("localhost");
    });

    it("mock user ID is clearly marked as dev/test", async () => {
      const { DEV_USER } = await loadDevAuth();
      expect(DEV_USER.id).toContain("dev");
    });
  });

  describe("isDevAuthClient()", () => {
    it("returns false when document is undefined (server-side)", async () => {
      (process.env as any).NODE_ENV = "development";
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED = "true";
      const { isDevAuthClient } = await loadDevAuth();
      // In node test environment, document is undefined
      expect(isDevAuthClient()).toBe(false);
    });
  });

  describe("cookie name is not guessable from common patterns", () => {
    it("cookie name does not use obvious names like 'admin' or 'bypass'", async () => {
      const { DEV_AUTH_COOKIE } = await loadDevAuth();
      expect(DEV_AUTH_COOKIE).not.toContain("admin");
      expect(DEV_AUTH_COOKIE).not.toContain("bypass");
      expect(DEV_AUTH_COOKIE).not.toContain("override");
    });
  });
});
