/**
 * /docs — public documentation.
 *
 * Getting started (account → sign-in → editor → publish), a high-level tour of
 * the four corners, and how to browse the public gallery. No account required.
 * The comprehensive creator + API reference lives at /docs/creator (sign-in).
 *
 * Inherits the app theme (dark/light + persona) via --fc-* variables.
 */
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { docsData } from "./_data/docsData";
import styles from "./docs.module.css";
import {
  Steps,
  CornerDiagram,
  CornerSummary,
  Callout,
  SectionHeading,
} from "./_components/DocsUI";
import { DocsToc } from "./_components/DocsToc";
import { DocsSearch } from "./_components/DocsSearch";

const TOC = [
  { id: "getting-started", label: "From request to published" },
  { id: "four-corners", label: "The four corners" },
  { id: "gallery", label: "Browsing the gallery" },
];

export const metadata = {
  title: "Documentation — Four Corners",
  description:
    "Getting started with Four Corners: request an account, build a project across the four corners, publish to the gallery, and share your work.",
};

export default function DocsHomePage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppHeader />
      <div className="h-14 sm:h-16" />
      <main className="flex-1">
        <div className={styles.wrap}>
          <p className={styles.kicker}>Documentation</p>
          <h1 className="fc-view-heading" style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0 0.6rem" }}>
            Getting started with Four Corners
          </h1>
          <p className={styles.lede}>{docsData.tagline}</p>

          <DocsSearch page="/docs" />
          <DocsToc items={TOC} />

          <hr className={styles.rule} />

          <SectionHeading id="getting-started">From request to published</SectionHeading>
          <Steps steps={docsData.gettingStarted} />

          <SectionHeading id="four-corners">The four corners</SectionHeading>
          <p className={styles.lede} style={{ marginBottom: "1rem" }}>
            Every project is built around four corners. Fill as much or as little as you like — there is no minimum.
          </p>
          <CornerDiagram corners={docsData.corners} />
          <div className={styles.gridTwo} style={{ marginTop: "0.75rem" }}>
            {docsData.corners.map((c) => (
              <CornerSummary key={c.key} corner={c} />
            ))}
          </div>

          <SectionHeading id="gallery">Browsing the gallery</SectionHeading>
          <p className={styles.lede}>
            No account is needed to browse. Anyone can view published work in the public gallery, open a
            project to see its primary image, and explore each of its four corners by clicking the corner
            icons on the photograph. Every published project has its own shareable URL, and a share link is
            available from the gallery list view.
          </p>

          <Callout>
            Looking for the full field-by-field reference?{" "}
            <Link href="/docs/creator" className={styles.calloutLink}>
              Open the comprehensive creator guide →
            </Link>{" "}
            (sign-in required).
          </Callout>

          <Callout>
            Using a keyboard or screen reader?{" "}
            <Link href="/docs/accessibility" className={styles.calloutLink}>
              Read the accessibility guide →
            </Link>
          </Callout>
        </div>
      </main>
    </div>
  );
}
