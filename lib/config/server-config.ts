/**
 * Server configuration: which adapter backs each port, plus the product
 * limits that used to live in admin tables.
 *
 * Every value has a default that works with no accounts and no services, so
 * `npm run dev` runs the whole app out of the box.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { UserPlan } from "@/lib/upload-limits";

export type AdapterName = "local" | "stub";

export interface ServerConfig {
  adapters: {
    auth: AdapterName;
    data: AdapterName;
    blobs: AdapterName;
    search: AdapterName;
    ai: AdapterName;
    email: AdapterName;
    rateLimit: AdapterName;
    geocoder: AdapterName;
  };
  dataDir: string;
  sessionSecret: string;
  signupsEnabled: boolean;
  /** Projects one owner may keep in the public gallery; null means unlimited. */
  galleryLimitPerUser: number | null;
  defaultPlan: UserPlan;
  storageLimitBytes: number | null;
  privateUrlTtlSeconds: number;
  publicApiKeys: string[];
}

function adapter(name: string | undefined, fallback: AdapterName): AdapterName {
  return name === "local" || name === "stub" ? name : fallback;
}

function positiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function isPlan(value: string | undefined): value is UserPlan {
  return value === "free" || value === "pro" || value === "team" || value === "unlimited";
}

/**
 * Session secret: explicit in production, generated into the data dir for
 * local runs so a fresh clone does not need any setup.
 */
function resolveSessionSecret(dataDir: string): string {
  const fromEnv = process.env.FC_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FC_SESSION_SECRET must be set in production — sessions are signed with it.",
    );
  }

  const file = join(dataDir, "secret.key");
  mkdirSync(dataDir, { recursive: true });
  if (existsSync(file)) return readFileSync(file, "utf8").trim();

  const generated = randomBytes(32).toString("hex");
  writeFileSync(file, `${generated}\n`, { mode: 0o600 });
  return generated;
}

function build(): ServerConfig {
  const fallback = adapter(process.env.FC_ADAPTER_DEFAULT, "local");
  const dataDir = resolve(process.cwd(), process.env.FC_DATA_DIR || ".data");

  return {
    adapters: {
      auth: adapter(process.env.FC_AUTH_ADAPTER, fallback),
      data: adapter(process.env.FC_DATA_ADAPTER, fallback),
      blobs: adapter(process.env.FC_BLOB_ADAPTER, fallback),
      search: adapter(process.env.FC_SEARCH_ADAPTER, fallback),
      ai: adapter(process.env.FC_AI_ADAPTER, fallback),
      email: adapter(process.env.FC_EMAIL_ADAPTER, fallback),
      rateLimit: adapter(process.env.FC_RATE_LIMIT_ADAPTER, fallback),
      geocoder: adapter(process.env.FC_GEOCODER_ADAPTER, fallback),
    },
    dataDir,
    sessionSecret: resolveSessionSecret(dataDir),
    signupsEnabled: process.env.FC_SIGNUPS_ENABLED !== "false",
    galleryLimitPerUser: positiveInt(process.env.FC_GALLERY_LIMIT_PER_USER),
    defaultPlan: isPlan(process.env.FC_DEFAULT_PLAN) ? process.env.FC_DEFAULT_PLAN : "free",
    storageLimitBytes: positiveInt(process.env.FC_STORAGE_LIMIT_BYTES),
    privateUrlTtlSeconds: positiveInt(process.env.FC_PRIVATE_URL_TTL_SECONDS) ?? 600,
    publicApiKeys: (process.env.PUBLIC_API_KEYS ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  };
}

const cache = globalThis as typeof globalThis & { __fcServerConfig?: ServerConfig };

export function getConfig(): ServerConfig {
  return (cache.__fcServerConfig ??= build());
}
