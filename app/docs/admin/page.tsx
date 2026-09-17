/**
 * /docs/admin — admin guide (admin-gated).
 *
 * What each back-office section is for and who can do what (admin vs
 * super-admin). Visible to admins and up, the env-based admin password
 * session, or dev-auth locally — the same three-layer server-side gate as
 * /docs/changelog. Anyone else is redirected. Content is generated from
 * scripts/generate-docs.ts (EDITORIAL.adminGuide) into docsData.adminGuide.
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
import { Callout, SectionHeading } from "../_components/DocsUI";
import { DocsToc } from "../_components/DocsToc";
import { DocsSearch } from "../_components/DocsSearch";

const TOC = docsData.adminGuide.map((s) => ({ id: s.id, label: s.title }));

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Guide — Four Corners",
  description:
    "What each admin section is for and who can do what: dashboards, users, invites, ticket triage, design, and settings.",
};

export default async function AdminGuidePage() {
  // Gate: admins and up. Dev-auth (dev-only, double-gated off in prod) and the
  // env admin-password session also pass, mirroring /docs/changelog.
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
          <p className={styles.kicker}>Admin · Guide</p>
          <h1
            className="fc-view-heading"
            style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0 0.6rem" }}
          >
            The back-office, section by section
          </h1>
          <p className={styles.lede}>
            What each part of <code className={styles.mono}>/admin</code> is for,
            and which actions need a super-admin role.
          </p>

          <Callout>
            This page is visible to admins only. The creator reference lives at{" "}
            <Link href="/docs/creator" className={styles.calloutLink}>
              /docs/creator
            </Link>{" "}
            and release history at{" "}
            <Link href="/docs/changelog" className={styles.calloutLink}>
              /docs/changelog
            </Link>
            .
          </Callout>

          <DocsSearch page="/docs/admin" />
          <DocsToc items={TOC} />

          <hr className={styles.rule} />

          {docsData.adminGuide.map((section) => (
            <section key={section.id}>
              <SectionHeading id={section.id}>{section.title}</SectionHeading>
              <p className={styles.lede}>{section.blurb}</p>
              <ul className={styles.changeList}>
                {section.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
