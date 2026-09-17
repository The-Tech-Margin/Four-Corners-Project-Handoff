import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";
import { getServerUser } from "@/lib/server/session";
import { getQuota } from "@/lib/server/quota";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getServerUser();
  if (!user) redirect("/?auth=required");

  const userEmail = user.email;
  const quota = await getQuota(user.id);

  // Pass only auth info — projects are fetched client-side to avoid RSC serialization issues
  return (
    <DashboardClient
      projects={[]}
      storageUsed={quota.used}
      storageLimit={quota.limit}
      plan={quota.plan}
      userEmail={userEmail}
    />
  );
}
