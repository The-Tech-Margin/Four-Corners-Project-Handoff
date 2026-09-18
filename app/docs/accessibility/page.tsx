/**
 * /docs/accessibility — public accessibility guide.
 *
 * Plain-language guide to using Four Corners with a keyboard and a screen
 * reader. Content is generated from scripts/generate-docs.ts (EDITORIAL.
 * accessibility) into docsData.accessibility; the technical reference lives in
 * ACCESSIBILITY.md. No account required. Inherits the app theme via --fc-*.
 */
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { docsData } from "../_data/docsData";
import styles from "../docs.module.css";
import { Callout, SectionHeading } from "../_components/DocsUI";
import { DocsToc } from "../_components/DocsToc";

const TOC = docsData.accessibility.map((s) => ({ id: s.id, label: s.title }));

export const metadata = {
  title: "Accessibility — Four Corners",
  description:
    "How to use Four Corners with a keyboard and a screen reader: navigation, opening and closing the viewer panels, browsing the gallery, and reporting a barrier.",
};

export default function DocsAccessibilityPage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppHeader />
      <div className="h-14 sm:h-16" />
      <main className="flex-1">
        <div className={styles.wrap}>
          <p className={styles.kicker}>Documentation</p>
          <h1
            className="fc-view-heading"
            style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0 0.6rem" }}
          >
            Accessibility
          </h1>
          <p className={styles.lede}>
            Four Corners is built to be usable with a keyboard and a screen reader.
            Here&apos;s how to get around — and how to let us know if something gets
            in your way.
          </p>

          <DocsToc items={TOC} />

          <hr className={styles.rule} />

          {docsData.accessibility.map((section) => (
            <section key={section.id}>
              <SectionHeading id={section.id}>{section.title}</SectionHeading>
              <ul className={styles.changeList}>
                {section.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))}

          <Callout>
            For the full technical reference (landmarks, ARIA patterns, testing
            tools), see{" "}
            <Link href="/docs/creator" className={styles.calloutLink}>
              the creator guide →
            </Link>{" "}
            or the project&apos;s <code className={styles.mono}>ACCESSIBILITY.md</code>.
          </Callout>
        </div>
      </main>
    </div>
  );
}
