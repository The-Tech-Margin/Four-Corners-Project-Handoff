import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicKey } from "@/lib/supabase/public-key";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublicKey();

  if (!url || !key) {
    // Return a mock client for build/development without credentials
    return null as unknown as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(url, key, {
    global: {
      headers: {
        Accept: "application/json",
      },
    },
  });
}
