/**
 * Outbound HTTP on a visitor's behalf (link previews).
 *
 * The address is resolved here and checked before the socket opens, and
 * again on every redirect, so a hostname cannot point at localhost, a
 * private network or a cloud metadata service. Responses are capped in both
 * bytes and time.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { isBlockedAddress } from "@/lib/security/ip-classify";

export interface SafeFetchPolicy {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
}

export const DEFAULT_SAFE_FETCH_POLICY: SafeFetchPolicy = {
  maxBytes: 16 * 1024,
  timeoutMs: 5000,
  maxRedirects: 3,
};

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  headers: Headers;
  body: string;
}

export class BlockedUrlError extends Error {
  constructor(reason: string) {
    super(`Refused to fetch this URL: ${reason}`);
    this.name = "BlockedUrlError";
  }
}

const ALLOWED_PORTS = new Set(["", "80", "443"]);

async function assertFetchable(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("it is not a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("only http and https are allowed");
  }
  if (url.username || url.password) throw new BlockedUrlError("it carries credentials");
  if (!ALLOWED_PORTS.has(url.port)) throw new BlockedUrlError("that port is not allowed");

  const addresses = await dnsLookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new BlockedUrlError("the host does not resolve");
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new BlockedUrlError("it resolves to a non-public address");
  }

  return url;
}

/** GET a URL with redirects validated one hop at a time. */
export async function safeGet(
  raw: string,
  policy: SafeFetchPolicy = DEFAULT_SAFE_FETCH_POLICY,
  init: { headers?: Record<string, string> } = {},
): Promise<SafeFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeoutMs);

  try {
    let current = await assertFetchable(raw);

    for (let hop = 0; hop <= policy.maxRedirects; hop += 1) {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: init.headers,
      });

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        current = await assertFetchable(new URL(location, current).toString());
        continue;
      }

      return {
        finalUrl: current.toString(),
        status: response.status,
        headers: response.headers,
        body: await readCapped(response, policy.maxBytes),
      };
    }

    throw new BlockedUrlError("it redirected too many times");
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const remaining = maxBytes - total;
    if (value.byteLength >= remaining) {
      chunks.push(value.subarray(0, remaining));
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}
