/**
 * About Page — Four Corners Metadata Editor
 *
 * Shares the /docs presentational system (theme-tokenized cards, headings, and
 * table of contents) so the page inherits dark/light + persona palettes and
 * stays visually consistent with the in-app documentation.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 * @see https://www.thetechmargin.com
 */

import type { CSSProperties } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import styles from "@/app/docs/docs.module.css";
import { SectionHeading, Callout } from "@/app/docs/_components/DocsUI";
import { DocsToc } from "@/app/docs/_components/DocsToc";

export const metadata = {
  title: "About — Four Corners",
  description:
    "A media-literacy tool for reading images critically — surfacing the context, sources, backstory, and authorship behind a photograph.",
};

const TOC = [
  { id: "why", label: "Why Four Corners" },
  { id: "four-corners", label: "The four corners" },
  { id: "features", label: "Key features" },
];

/** Inline CSS custom property to tint a card's left border with a corner color. */
const accent = (token: string): CSSProperties =>
  ({ ["--accent"]: `var(--fc-corner-${token})` }) as CSSProperties;

const CORNERS = [
  {
    token: "context",
    label: "Context",
    subtitle: "Related Imagery",
    desc: "Companion photographs, sequences, and archival images. A single frame can mislead — related imagery shows what surrounds the decisive moment.",
  },
  {
    token: "links",
    label: "Links",
    subtitle: "External References",
    desc: "Curated links to articles, investigations, and institutional sources, connecting the photograph to verifiable, accountable reporting.",
  },
  {
    token: "backstory",
    label: "Backstory",
    subtitle: "The Photographer's Voice",
    desc: "The photographer's first-person account — written or spoken — of how, where, and why the frame was made.",
  },
  {
    token: "cc",
    label: "Authorship",
    subtitle: "Ethics & Rights",
    desc: "Credit, license, consent, and code-of-ethics and staging disclosure: what's permitted, who consented, and what's responsible.",
  },
];

const FEATURES = [
  {
    title: "Voice Recording",
    desc: "Record audio notes that auto-transcribe with Whisper — capture testimony in the field without typing.",
    path: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  },
  {
    title: "Location & EXIF",
    desc: "Camera, lens, timestamps, and GPS flow in from the image file on upload — no manual entry under deadline.",
    path: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
  },
  {
    title: "Cloud Sync",
    desc: "Sign in to save projects and pick them up from any device.",
    path: "M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z",
  },
  {
    title: "Two-Tier Publishing",
    desc: "Private share links for sensitive or in-progress work; a public gallery listing for finished pieces.",
    path: "M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppHeader />
      <div className="h-14 sm:h-16" />

      <main className="flex-1">
        <div className={styles.wrap}>
          <p className={styles.kicker}>About</p>
          <h1
            className="fc-view-heading"
            style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0 0.6rem" }}
          >
            Four Corners Metadata Editor
          </h1>
          <p className={styles.lede}>
            A media-literacy tool for reading images critically. A photograph
            rarely tells the whole story on its own — Four Corners attaches the
            context, sources, backstory, and authorship to an image, turning
            photographers into authors and viewers into critical readers. Built
            on the{" "}
            <a
              href="https://fourcornersproject.org"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.calloutLink}
            >
              Four Corners Project
            </a>{" "}
            framework conceived by Fred Ritchin.
          </p>

          <DocsToc items={TOC} />

          <hr className={styles.rule} />

          {/* Why Four Corners — theory & philosophy */}
          <SectionHeading id="why">Why Four Corners</SectionHeading>
          <p className={styles.lede} style={{ marginBottom: "0.9rem" }}>
            Photographs are losing their authority as witnesses. AI image
            generation, the collapse of newsroom photo desks, and a fractured
            information landscape have made &ldquo;seeing is believing&rdquo;
            unreliable. Provenance standards like C2PA can trace where a file came
            from — but not the human context that makes an image trustworthy: who
            made it, how, why, and what surrounds it.
          </p>
          <p className={styles.lede} style={{ marginBottom: "0.9rem" }}>
            Four Corners answers a question the editor and critic Fred Ritchin
            began asking decades ago. As picture editor of{" "}
            <em>The New York Times Magazine</em> and in his 1990 book{" "}
            <em>In Our Own Image: The Coming Revolution in Photography</em>,
            Ritchin foresaw that the digital era would erode photography&rsquo;s
            credibility — and argued the response was not to lock images down but
            to open them up. A photograph, he proposed, should be a starting point
            rather than a final word: a frame whose four corners each lead outward
            to the context that gives it meaning.
          </p>
          <p className={styles.lede}>
            This editor is built on that idea. By making the context behind an
            image visible, it asks viewers to read photographs critically rather
            than take them at face value — and gives photographers the means to
            stand behind their work as authors.
          </p>

          {/* The four corners */}
          <SectionHeading id="four-corners">The four corners</SectionHeading>
          <p className={styles.lede} style={{ marginBottom: "0.5rem" }}>
            Each corner answers a question every reader should ask of an image:
          </p>
          <div className={styles.gridTwo} style={{ marginTop: "0.75rem" }}>
            {CORNERS.map((c) => (
              <div key={c.token} className={styles.card} style={accent(c.token)}>
                <div className={styles.cardHead}>
                  <span className={styles.cardTitle}>{c.label}</span>
                  <span className={styles.cardSub}>{c.subtitle}</span>
                </div>
                <p className={styles.cardBody}>{c.desc}</p>
              </div>
            ))}
          </div>

          {/* Key features */}
          <SectionHeading id="features">Key features</SectionHeading>
          <div className={styles.gridTwo} style={{ marginTop: "0.75rem" }}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.card}>
                <div className={styles.cardHead}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--fc-accent)"
                    strokeWidth={1.5}
                    aria-hidden
                    style={{ flexShrink: 0 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={f.path} />
                  </svg>
                  <span className={styles.cardTitle}>{f.title}</span>
                </div>
                <p className={styles.cardBody}>{f.desc}</p>
              </div>
            ))}
          </div>

          <Callout>
            New here?{" "}
            <Link href="/docs" className={styles.calloutLink}>
              Read the docs →
            </Link>{" "}
            for a full getting-started guide and the field-by-field creator
            reference.
          </Callout>
        </div>
      </main>
    </div>
  );
}
