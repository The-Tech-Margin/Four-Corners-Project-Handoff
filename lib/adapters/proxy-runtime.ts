/**
 * The slice of the composition root the proxy needs. Next warns against the
 * proxy sharing modules with render code, so it takes only the rate-limit
 * counter and a signature-only session check — never the data store.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { getConfig } from "@/lib/config/server-config";
import { readSessionToken } from "@/lib/security/session-token";
import type { RateLimitStore } from "@/lib/ports/rate-limit";
import { createLocalRateLimitStore } from "./local/rate-limit";
import { createStubRateLimitStore } from "./stub/rate-limit";

const cache = globalThis as typeof globalThis & { __fcProxyRateLimit?: RateLimitStore };

export function getRateLimitStore(): RateLimitStore {
  return (cache.__fcProxyRateLimit ??=
    getConfig().adapters.rateLimit === "local"
      ? createLocalRateLimitStore()
      : createStubRateLimitStore());
}

/** Signature and expiry only — enough to gate a page, never a data lookup. */
export function peekSessionUserId(cookieValue: string | undefined): string | null {
  return readSessionToken(cookieValue, getConfig().sessionSecret)?.uid ?? null;
}
