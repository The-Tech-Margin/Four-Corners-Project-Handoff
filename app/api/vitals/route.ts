/**
 * Web Vitals / Speed Insights log drain route.
 * Receives performance metrics from @vercel/speed-insights client SDK
 * and persists them into the speed_insights Supabase table.
 *
 * Vercel Log Drain (if configured) can also POST here.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseUA } from "@/lib/ua-parse";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

declare global {
  // eslint-disable-next-line no-var
  var __vitalsWarned: boolean | undefined;
}

interface VitalsMetric {
  name?: string;
  value?: number;
  timestamp?: number;
  pathname?: string;
  path?: string;
  route?: string;
  href?: string;
  origin?: string;
  deviceType?: string;
  connectionSpeed?: string;
  effectiveType?: string;
  country?: string;
  deploymentId?: string;
  environment?: string;
  attribution?: Record<string, unknown>;
  sdkName?: string;
  sdkVersion?: string;
  scriptVersion?: string;
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()!,
);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Capture geographic hints from Vercel edge headers. These are set by the
    // Vercel proxy and reflect the end-user's IP, not the origin.
    const hdr = request.headers;
    const headerCountry =
      hdr.get("x-vercel-ip-country") || hdr.get("cf-ipcountry") || null;
    const headerCity = hdr.get("x-vercel-ip-city") || null;
    const headerRegion =
      hdr.get("x-vercel-ip-country-region") ||
      hdr.get("x-vercel-ip-region") ||
      null;

    // Parse browser + OS from the user-agent header once for this batch
    const { browser, os, device } = parseUA(hdr.get("user-agent"));

    // Handle single metric or array of metrics
    const metrics: VitalsMetric[] = Array.isArray(body) ? body : [body];

    const rows = metrics
      .filter((m) => m.name && m.value != null)
      .map((m) => ({
        metric_type: m.name, // CLS, FCP, FID, INP, LCP, TTFB
        value: m.value,
        timestamp: m.timestamp
          ? new Date(m.timestamp).toISOString()
          : new Date().toISOString(),
        path: m.pathname || m.path || null,
        route: m.route || null,
        origin: m.href || m.origin || null,
        device_type: m.deviceType || device,
        connection_speed: m.connectionSpeed || m.effectiveType || null,
        country: m.country || headerCountry,
        city: headerCity ? decodeURIComponent(headerCity) : null,
        region: headerRegion,
        browser,
        os,
        deployment_id: m.deploymentId || process.env.VERCEL_DEPLOYMENT_ID || null,
        vercel_env: m.environment || process.env.VERCEL_ENV || null,
        attribution: m.attribution ? JSON.stringify(m.attribution) : null,
        sdk_name: m.sdkName || "speed-insights",
        sdk_version: m.sdkVersion || null,
        script_version: m.scriptVersion || null,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }

    const { error } = await supabaseAdmin
      .from("speed_insights")
      .insert(rows);

    if (error) {
      // Table may not exist yet (migration 025 not applied) — don't 500
      if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
        // Only log once per deploy to avoid noise
        if (!globalThis.__vitalsWarned) {
          console.warn("[vitals] speed_insights table not found — migration 025 pending");
          globalThis.__vitalsWarned = true;
        }
      } else {
        console.warn("[vitals] Insert error:", error);
      }
      return NextResponse.json({ ok: true, inserted: 0, skipped: true });
    }

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (err) {
    console.error("[vitals] Route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 },
    );
  }
}
