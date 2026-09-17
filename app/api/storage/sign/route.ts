import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getSupabaseSecretKey } from "@/lib/supabase/secret-key";

const ALLOWED_BUCKETS = ["voice-recordings", "consent-documents"] as const;
type AllowedBucket = (typeof ALLOWED_BUCKETS)[number];

const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;
const CONSENT_DOC_TTL_SECONDS = 60;

/**
 * POST /api/storage/sign - Generate signed URLs for private buckets.
 *
 * voice-recordings: anonymous by design — public gallery playback depends
 * on unauthenticated viewers being able to play audio. Long-lived URLs.
 *
 * consent-documents: the most sensitive bucket. Requires a session AND the
 * path must live under the caller's own user-id prefix (otherwise any
 * authenticated user could enumerate other users' consent PDFs). Short TTL —
 * consumers fetch immediately (export engine), never persist the URL.
 */
export async function POST(request: NextRequest) {
  try {
    const { bucket, path } = await request.json();

    if (!bucket || !path || typeof bucket !== "string" || typeof path !== "string") {
      return NextResponse.json(
        { error: "Missing required fields: bucket, path" },
        { status: 400 },
      );
    }

    if (!ALLOWED_BUCKETS.includes(bucket as AllowedBucket)) {
      return NextResponse.json(
        { error: "Invalid bucket" },
        { status: 400 },
      );
    }

    let ttl = TEN_YEARS_IN_SECONDS;

    if (bucket === "consent-documents") {
      const supabase = await createServerClient();
      if (!supabase) {
        return NextResponse.json({ error: "Not configured" }, { status: 500 });
      }
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!path.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      ttl = CONSENT_DOC_TTL_SECONDS;
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      getSupabaseSecretKey()!,
    );

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttl);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 },
      );
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 },
    );
  }
}
