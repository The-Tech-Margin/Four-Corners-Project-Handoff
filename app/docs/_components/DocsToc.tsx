"use client";

/**
 * Floating table of contents for the /docs pages.
 *
 * - Wide screens (≥ 84rem): pinned in the left margin, always expanded.
 * - Small screens: an inline "On this page" disclosure, collapsed by default
 *   and toggled by the user. Closes itself after a link is tapped.
 *
 * Each row carries a section icon tinted from the rotating --fc-corner-*
 * palette, so colours inherit dark/light mode and persona overrides.
 */
import { useState } from "react";
import {
  Accessibility,
  Braces,
  ChartColumn,
  Eye,
  Frame,
  Gauge,
  Hash,
  Images,
  Inbox,
  Layers,
  LayoutGrid,
  List,
  Mail,
  Palette,
  Rocket,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import styles from "../docs.module.css";

export type TocItem = { id: string; label: string };

/** Section id → icon. Falls back to a hash glyph for anything unmapped. */
const TOC_ICONS: Record<string, LucideIcon> = {
  "getting-started": Rocket,
  "four-corners": Frame,
  gallery: Images,
  publishing: Eye,
  "field-reference": List,
  "cross-cutting": Layers,
  api: Braces,
  accessibility: Accessibility,
  // admin guide sections
  overview: LayoutGrid,
  analytics: ChartColumn,
  performance: Gauge,
  users: Users,
  invites: Mail,
  tickets: Inbox,
  design: Palette,
  settings: Settings,
};

const CORNER_TOKENS = [
  "--fc-corner-context",
  "--fc-corner-backstory",
  "--fc-corner-links",
  "--fc-corner-cc",
];

export function DocsToc({ items }: { items: TocItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <nav className={styles.toc} aria-label="On this page">
      <button
        type="button"
        className={styles.tocToggle}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        On this page
        <span className={styles.tocChevron} aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      <ul className={`${styles.tocList} ${open ? styles.tocListOpen : ""}`}>
        {items.map((it, i) => {
          const Icon = TOC_ICONS[it.id] ?? Hash;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                className={styles.tocLink}
                onClick={() => setOpen(false)}
              >
                <Icon
                  className={styles.tocIcon}
                  size={15}
                  style={{ color: `var(${CORNER_TOKENS[i % CORNER_TOKENS.length]})` }}
                  aria-hidden
                />
                <span className={styles.tocLabel}>{it.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
