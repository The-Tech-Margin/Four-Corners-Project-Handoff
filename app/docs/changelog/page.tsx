/**
 * /docs/changelog — documentation & release version history (admin-gated).
 *
 * Visible to admins and up (admin / super_admin), the env-based admin password
 * session, or dev-auth locally. Anyone else is redirected. Entries are hand-
 * maintained in scripts/generate-docs.ts (EDITORIAL.versionHistory); `version`
 * is intended to track a git release tag.
 *
 * Inherits the app theme (dark/light + persona) via --fc-* variables.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { isCurrentUserAdmin } from "@/lib/admin-roles";
import { DEV_AUTH_COOKIE, isDevAuthEnabled } from "@/lib/dev-auth";
import { docsData } from "../_data/docsData";
import styles from "../docs.module.css";
import { VersionHistory, Callout } from "../_components/DocsUI";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Version History — Four Corners",
  description: "Documentation and release history for the Four Corners app.",
};

export default async function ChangelogPage() {
  // Gate: admins and up. Dev-auth (dev-only, double-gated off in prod) and the
  // env admin-password session also pass, mirroring the admin dashboard.
  const cookieStore = await cookies();
  const isDevAuth =
    isDevAuthEnabled() && cookieStore.get(DEV_AUTH_COOKIE)?.value === "true";

  let allowed = isDevAuth || (await verifyAdminSession());
  if (!allowed) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/?auth=required");
    allowed = await isCurrentUserAdmin();
    if (!allowed) redirect("/docs/creator");
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppHeader />
      <div className="h-14 sm:h-16" />
      <main className="flex-1">
        <div className={styles.wrap}>
          <p className={styles.kicker}>Admin · Version History</p>
          <h1 className="fc-view-heading" style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0 0.6rem" }}>
            Documentation &amp; release history
          </h1>
          <p className={styles.lede}>
            A running record of notable changes, newest first. Each entry&rsquo;s version is intended to track a
            git release tag; the list is maintained alongside the docs source.
          </p>

          <Callout>
            This page is visible to admins only. The full creator reference lives at{" "}
            <Link href="/docs/creator" className={styles.calloutLink}>
              /docs/creator
            </Link>
            .
          </Callout>

          <div style={{ marginTop: "1.25rem" }}>
            <VersionHistory versions={docsData.versionHistory} />
          </div>
        </div>
      </main>
    </div>
  );
}
