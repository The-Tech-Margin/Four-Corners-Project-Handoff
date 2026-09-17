import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";
import { DEV_AUTH_COOKIE, DEV_USER, isDevAuthEnabled } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Dev auth bypass
  const cookieStore = await cookies();
  const isDevAuth =
    isDevAuthEnabled() &&
    cookieStore.get(DEV_AUTH_COOKIE)?.value === "true";

  let userEmail: string;

  if (isDevAuth) {
    userEmail = DEV_USER.email;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/?auth=required");
    }

    userEmail = user.email || "";
  }

  // Pass only auth info — projects are fetched client-side to avoid RSC serialization issues
  return (
    <DashboardClient
      projects={[]}
      storageUsed={0}
      storageLimit={100 * 1024 * 1024}
      userEmail={userEmail}
    />
  );
}
