import { describe, it, expect } from "vitest";
import { hashPassword, isAcceptablePassword, verifyPassword } from "@/lib/security/password";
import { createSessionToken, readSessionToken } from "@/lib/security/session-token";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { isBlockedAddress } from "@/lib/security/ip-classify";

const SECRET = "test-secret";

describe("passwords", () => {
  it("accepts a reasonable length only", () => {
    expect(isAcceptablePassword("short")).toBe(false);
    expect(isAcceptablePassword("long-enough-1")).toBe(true);
    expect(isAcceptablePassword("x".repeat(129))).toBe(false);
  });

  it("verifies its own hash and rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("something else", hash)).toBe(false);
  });

  it("salts each hash separately", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
  });

  it("refuses a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$1$2$3$$")).toBe(false);
  });
});

describe("session tokens", () => {
  const token = () =>
    createSessionToken({ userId: "u1", sessionVersion: 2, ttlSeconds: 60 }, SECRET);

  it("round-trips the user and session version", () => {
    const payload = readSessionToken(token(), SECRET);
    expect(payload?.uid).toBe("u1");
    expect(payload?.sv).toBe(2);
  });

  it("rejects a different secret, a tampered payload and an expired token", () => {
    expect(readSessionToken(token(), "other-secret")).toBeNull();

    const [payload, signature] = token().split(".");
    const forged = Buffer.from(
      JSON.stringify({ uid: "admin", sv: 2, iat: 0, exp: 9999999999 }),
    ).toString("base64url");
    expect(readSessionToken(`${forged}.${signature}`, SECRET)).toBeNull();
    expect(readSessionToken(`${payload}.`, SECRET)).toBeNull();

    const expired = createSessionToken(
      { userId: "u1", sessionVersion: 1, ttlSeconds: 1 },
      SECRET,
      Date.now() - 10_000,
    );
    expect(readSessionToken(expired, SECRET)).toBeNull();
  });

  it("treats a missing cookie as no session", () => {
    expect(readSessionToken(undefined, SECRET)).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeNextPath("/dashboard?tab=1")).toBe("/dashboard?tab=1");
  });

  it("refuses anything that leaves the site", () => {
    for (const hostile of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", ""]) {
      expect(safeNextPath(hostile)).toBe("/");
    }
  });
});

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local and metadata addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.9",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "not-an-address",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const address of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });
});
