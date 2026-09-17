import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

/**
 * POST /api/drains/speed-insights
 *
 * Receives Vercel Speed Insights drain data (JSON array of metric objects).
 * Authenticates via HMAC-SHA1 signature verification (x-vercel-signature),
 * maps camelCase fields → snake_case columns, and batch-inserts into Supabase.
 *
 * @see https://vercel.com/docs/drains/security#secure-drains
 */

const VALID_METRICS = new Set(["CLS", "LCP", "FID", "FCP", "TTFB", "INP"]);

/** Shape of a single Vercel Speed Insights drain event (camelCase fields). */
interface DrainEvent {
  schema?: string;
  metricType?: string;
  value?: number;
  timestamp?: string | number;
  path?: string;
  route?: string;
  origin?: string;
  deviceType?: string;
  deviceId?: string;
  deviceBrand?: string;
  osName?: string;
  osVersion?: string;
  clientName?: string;
  clientType?: string;
  clientVersion?: string;
  connectionSpeed?: string;
  browserEngine?: string;
  browserEngineVersion?: string;
  country?: string;
  region?: string;
  city?: string;
  projectId?: string;
  ownerId?: string;
  deploymentId?: string;
  vercelEnvironment?: string;
  vercelUrl?: string;
  scriptVersion?: string;
  sdkVersion?: string;
  sdkName?: string;
  attribution?: Record<string, unknown> | null;
}

/** HMAC-SHA1 hash used by Vercel to sign drain payloads */
function sha1(data: Buffer, secret: string): string {
  return crypto.createHmac("sha1", secret).update(data).digest("hex");
}

/** Constant-time comparison to prevent timing attacks */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: NextRequest) {
  // 1. Read raw body for signature verification, then parse
  const rawBody = await req.text();

  // Verify HMAC signature when secret is configured
  const secret = process.env.VERCEL_DRAIN_SECRET;
  if (secret) {
    const rawBodyBuffer = Buffer.from(rawBody, "utf-8");
    const expectedSignature = sha1(rawBodyBuffer, secret);
    const receivedSignature = req.headers.get("x-vercel-signature") || "";

    if (
      !receivedSignature ||
      !secureCompare(expectedSignature, receivedSignature)
    ) {
      console.warn("[speed-insights] Signature mismatch");
      return NextResponse.json(
        { code: "invalid_signature", error: "Signature didn't match" },
        { status: 403 },
      );
    }
  } else {
    console.warn("[speed-insights] VERCEL_DRAIN_SECRET not set — skipping signature verification");
  }

  // 2. Parse body — Vercel sends a JSON array
  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events: DrainEvent[] = Array.isArray(payload)
    ? (payload as DrainEvent[])
    : [payload as DrainEvent];

  if (events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  // 3. Map and filter to valid speed insight records
  const rows = events
    .filter(
      (e) =>
        e.schema === "vercel.speed_insights.v1" &&
        typeof e.metricType === "string" &&
        VALID_METRICS.has(e.metricType) &&
        typeof e.value === "number",
    )
    .map((e) => ({
      // Core metric data
      metric_type: e.metricType,
      value: e.value,
      timestamp: e.timestamp,
      // Page identification
      path: e.path || null,
      route: e.route || null,
      origin: e.origin || null,
      // Device & client
      device_type: e.deviceType || null,
      device_id: e.deviceId || null,
      device_brand: e.deviceBrand || null,
      os_name: e.osName || null,
      os_version: e.osVersion || null,
      client_name: e.clientName || null,
      client_type: e.clientType || null,
      client_version: e.clientVersion || null,
      connection_speed: e.connectionSpeed || null,
      browser_engine: e.browserEngine || null,
      browser_engine_version: e.browserEngineVersion || null,
      // Geo
      country: e.country || null,
      region: e.region || null,
      city: e.city || null,
      // Vercel context
      project_id_vercel: e.projectId || null,
      owner_id: e.ownerId || null,
      deployment_id: e.deploymentId || null,
      vercel_env: e.vercelEnvironment || null,
      vercel_url: e.vercelUrl || null,
      // SDK
      script_version: e.scriptVersion || null,
      sdk_version: e.sdkVersion || null,
      sdk_name: e.sdkName || null,
      // Attribution
      attribution: e.attribution || null,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  // 4. Batch insert via service role (bypasses RLS)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getSupabaseSecretKey();

  if (!url || !serviceKey) {
    console.error("[speed-insights] Missing Supabase credentials");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const supabase = createClient(url, serviceKey);

  const { error } = await supabase.from("speed_insights").insert(rows);

  if (error) {
    console.error("[speed-insights] Insert error:", error.message);
    return NextResponse.json(
      { error: "Failed to store metrics" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
