/**
 * Tiny User-Agent parser — zero dependencies.
 *
 * Returns a coarse browser/os/device classification good enough for an
 * analytics dashboard. Not a replacement for `ua-parser-js` — we only
 * need what Vercel's Web Analytics dashboard shows (6 browsers, 6 OSes,
 * desktop/mobile/tablet).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export type Device = "desktop" | "mobile" | "tablet";

export interface ParsedUA {
  browser: string;
  os: string;
  device: Device;
}

/**
 * Browser detection order matters: Edg/OPR/SamsungBrowser/Firefox must
 * come BEFORE generic "Chrome" and "Safari" matches because they include
 * those tokens in their own UA string.
 */
function detectBrowser(ua: string): string {
  if (/Edg\/|Edge\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Firefox\/|FxiOS/.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS/.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Unknown";
}

function detectOS(ua: string): string {
  // iOS check must come before macOS because iPads report "Mac OS X" in
  // desktop-mode Safari.
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

function detectDevice(ua: string): Device {
  if (/iPad|Tablet/.test(ua)) return "tablet";
  // Android "Mobile" token distinguishes phones from tablets
  if (/iPhone|iPod|Android.*Mobile|Mobi\//.test(ua)) return "mobile";
  return "desktop";
}

export function parseUA(ua: string | null | undefined): ParsedUA {
  if (!ua) return { browser: "Unknown", os: "Unknown", device: "desktop" };
  return {
    browser: detectBrowser(ua),
    os: detectOS(ua),
    device: detectDevice(ua),
  };
}
