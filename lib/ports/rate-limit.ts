/**
 * Rate-limit counter. One call per request from the proxy, so an adapter
 * must be fast and must fail open — a counter outage cannot take the site
 * down.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** ISO timestamp when the current window frees up. */
  resetAt: string;
}

export interface RateLimitStore {
  hit(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
}
