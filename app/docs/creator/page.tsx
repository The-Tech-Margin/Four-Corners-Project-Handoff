/**
 * /docs/creator — comprehensive creator + API documentation (auth-gated).
 *
 * Full field-by-field reference for each corner, cross-cutting data, publishing
 * states, and the public API surface. Mirrors the /dashboard auth gate.
 *
 * Inherits the app theme (dark/light + persona) via --fc-* variables.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { getServerUser } from "@/lib/server/session";
import { docsData } from "../_data/docsData";
import styles from "../docs.module.css";
import {
  Steps,
  CornerDiagram,
  CornerCard,
  CrossCard,
  VisibilityTable,
  ApiTable,
  Callout,
  SectionHeading,
} from "../_components/DocsUI";
import { DocsToc } from "../_components/DocsToc";
import { DocsSearch } from "../_components/DocsSearch";

const TOC = [
  { id: "getting-started", label: "From request to published" },
  { id: "four-corners", label: "The four corners" },
  { id: "publishing", label: "Saving, drafts & publishing" },
  { id: "field-reference", label: "Field reference" },
  { id: "cross-cutting", label: "Cross-cutting data" },
  { id: "api", label: "Public API" },
];

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Guide — Four Corners",
  description:
    "Comprehensive reference for building a project in the Four Corners editor: every corner's fields, cross-cutting data, publishing states, and the public API.",
};

export default async function CreatorDocsPage() {
  // Auth gate — mirror of /dashboard
  const user = await getServerUser();
  if (!user) redirect("/?auth=required");

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppHeader />
      <div className="h-14 sm:h-16" />
      <main className="flex-1">
        <div className={styles.wrap}>
          <p className={styles.kicker}>Creator Guide · Comprehensive</p>
          <h1 className="fc-view-heading" style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0 0.6rem" }}>
            Building a project, corner by corner
          </h1>
          <p className={styles.lede}>
            The editor is your home page after you sign in. Upload an image or video, then fill in any of the
            four corners — the corner icons on the preview jump you to each section. Every text field supports
            voice input with Whisper transcription.
          </p>

          <Callout>
            This is the complete guide. Prefer a shorter overview? See{" "}
            <Link href="/docs" className={styles.calloutLink}>
              the public getting-started page
            </Link>
            . Tip: use your browser&rsquo;s Print → Save as PDF to export any of these guides.
          </Callout>

          <DocsSearch page="/docs/creator" />
          <DocsToc items={TOC} />

          <SectionHeading id="getting-started">From request to published</SectionHeading>
          <Steps steps={docsData.gettingStarted} />

          <SectionHeading id="four-corners">The four corners</SectionHeading>
          <p className={styles.lede} style={{ marginBottom: "1rem" }}>
            Every project is built around four corners. Fill as much or as little as you like — there is no
            minimum.
          </p>
          <CornerDiagram corners={docsData.corners} />

          <SectionHeading id="publishing">Saving, drafts &amp; publishing</SectionHeading>
          <p className={styles.lede} style={{ marginBottom: "0.75rem" }}>
            A project needs a primary image and a title before it can be saved or published. Visibility is
            controlled by two flags — a project is only public when both are on:
          </p>
          <VisibilityTable rows={docsData.visibility} />

          <SectionHeading id="field-reference">Field reference, corner by corner</SectionHeading>
          {docsData.corners.map((c) => (
            <CornerCard key={c.key} corner={c} />
          ))}

          <SectionHeading id="cross-cutting">Cross-cutting data</SectionHeading>
          {docsData.crossCutting.map((c) => (
            <CrossCard key={c.key} item={c} />
          ))}

          <SectionHeading id="api">Public API</SectionHeading>
          <p className={styles.lede} style={{ marginBottom: "0.5rem" }}>
            The gallery is backed by a public, read-only API. Authentication is optional — a bearer key simply
            raises the rate limit. Base URL:{" "}
            <span className={styles.mono}>{docsData.apiInfo.baseUrl}</span>. Projects are returned only when
            published and listed in the gallery.
          </p>
          <ApiTable rows={docsData.api} />

          <p className={styles.metaLine}>
            Generated {docsData.generatedAt} from
            lib/field-registry.ts + lib/openapi-spec.ts
          </p>
        </div>
      </main>
    </div>
  );
}
