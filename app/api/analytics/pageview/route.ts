/**
 * Page view ingest — receives POSTs from the client PageViewReporter and
 * writes a row to `page_views`. Designed to be fail-open: if Supabase is
 * unreachable or the table is missing, we swallow the error and return 200
 * so navigation is never blocked on analytics.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseUA } from "@/lib/ua-parse";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

declare global {
  // eslint-disable-next-line no-var
  var __pageViewWarned: boolean | undefined;
}

interface PageViewBody {
  path?: string;
  route?: string;
  referrer?: string | null;
  sessionId?: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()!,
);

function parseReferrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    // Ignore same-origin referrers (internal nav); only record external hosts
    return u.hostname || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PageViewBody;
    if (!body?.path) {
      return NextResponse.json({ ok: true, inserted: 0, skipped: true });
    }

    const hdr = request.headers;
    const userAgent = hdr.get("user-agent");
    const country = hdr.get("x-vercel-ip-country");
    const cityRaw = hdr.get("x-vercel-ip-city");
    const region = hdr.get("x-vercel-ip-country-region");
    const city = cityRaw ? decodeURIComponent(cityRaw) : null;

    const { browser, os, device } = parseUA(userAgent);

    // Skip same-origin referrers (internal nav should not count as "referrer")
    const selfHost = (() => {
      try {
        return new URL(request.url).hostname;
      } catch {
        return null;
      }
    })();
    let referrerHost = parseReferrerHost(body.referrer);
    if (referrerHost && selfHost && referrerHost === selfHost) {
      referrerHost = null;
    }

    const row = {
      session_id: body.sessionId ?? null,
      path: body.path,
      route: body.route ?? null,
      referrer: body.referrer ?? null,
      referrer_host: referrerHost,
      user_agent: userAgent,
      browser,
      os,
      device_type: device,
      country,
      city,
      region,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      vercel_env: process.env.VERCEL_ENV ?? null,
    };

    const { error } = await supabaseAdmin.from("page_views").insert(row);

    if (error) {
      if (
        error.code === "PGRST205" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("page_views")
      ) {
        if (!globalThis.__pageViewWarned) {
          console.warn(
            "[pageview] page_views table not found — migration 033 pending",
          );
          globalThis.__pageViewWarned = true;
        }
      } else {
        console.warn("[pageview] Insert error:", error);
      }
      return NextResponse.json({ ok: true, inserted: 0, skipped: true });
    }

    return NextResponse.json({ ok: true, inserted: 1 });
  } catch (err) {
    console.error("[pageview] Route error:", err);
    return NextResponse.json({ ok: true, inserted: 0, skipped: true });
  }
}
