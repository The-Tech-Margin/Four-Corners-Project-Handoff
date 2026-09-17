import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.user_metadata?.has_password !== true) {
        return NextResponse.redirect(new URL("/auth/create-password", requestUrl.origin));
      }
    } catch {
      // fall through to redirect to next
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
