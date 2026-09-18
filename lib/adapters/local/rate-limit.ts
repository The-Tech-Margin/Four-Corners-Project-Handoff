/**
 * In-memory sliding-window rate limiter. Per process, which is right for a
 * single local server; a shared deployment needs a shared counter.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { RateLimitDecision, RateLimitRule, RateLimitStore } from "@/lib/ports/rate-limit";

const MAX_TRACKED_KEYS = 10_000;

export function createLocalRateLimitStore(): RateLimitStore {
  const windows = new Map<string, number[]>();

  return {
    async hit(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
      const now = Date.now();
      const windowMs = rule.windowSeconds * 1000;
      const hits = (windows.get(key) ?? []).filter((at) => now - at < windowMs);

      const allowed = hits.length < rule.limit;
      if (allowed) hits.push(now);

      windows.delete(key);
      windows.set(key, hits);
      // Oldest-first eviction keeps a busy public endpoint from growing the map forever.
      while (windows.size > MAX_TRACKED_KEYS) {
        const oldest = windows.keys().next();
        if (oldest.done) break;
        windows.delete(oldest.value);
      }

      const resetAt = new Date((hits[0] ?? now) + windowMs).toISOString();
      return {
        allowed,
        remaining: Math.max(0, rule.limit - hits.length),
        limit: rule.limit,
        resetAt,
      };
    },
  };
}
