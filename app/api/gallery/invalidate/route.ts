import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearGalleryCache } from "@/lib/gallery-cache";

/** POST /api/gallery/invalidate — bust the in-memory gallery cache. Requires auth. */
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  clearGalleryCache();
  return NextResponse.json({ ok: true });
}
