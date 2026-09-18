/**
 * Post-auth redirect targets. Only same-origin paths are allowed —
 * "//evil.com" and "/\evil.com" are browser-recognised absolute URLs.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

/** Control characters can smuggle a second header or confuse a parser. */
const CONTROL_CHARS = /\p{Cc}/u;

export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (CONTROL_CHARS.test(next)) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
