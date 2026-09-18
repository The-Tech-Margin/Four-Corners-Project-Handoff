/**
 * Rate-limit stub.
 *
 * A production adapter needs one counter shared by every instance, and must
 * fail open: if the counter is unreachable the site keeps serving.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { NotConfiguredError } from "@/lib/ports/errors";
import type { RateLimitStore } from "@/lib/ports/rate-limit";

const fail = (): never => {
  throw new NotConfiguredError(
    "RateLimitStore",
    "FC_RATE_LIMIT_ADAPTER",
    "Implement lib/ports/rate-limit.ts against a shared counter.",
  );
};

export function createStubRateLimitStore(): RateLimitStore {
  return { hit: fail };
}
