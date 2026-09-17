/**
 * DocsSearch — in-page search for the /docs pages.
 *
 * A WAI-ARIA combobox-with-listbox-popup: focus stays in the input, arrow keys
 * move the active option (announced via aria-activedescendant), Enter selects.
 * Selecting a section on the current page smooth-scrolls to its anchor (honours
 * prefers-reduced-motion); a result on another in-scope page navigates there.
 * Colours resolve from --fc-* tokens via the docs CSS module.
 *
 * @author @thetechmargin
 * @copyright 2026 TheTechMargin
 */
"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import styles from "../docs.module.css";
import {
  buildDocsIndex,
  filterByQuery,
  type DocsPage,
  type DocsSearchItem,
} from "@/lib/help-search";

/** Which pages each docs page is allowed to surface (avoids linking to gated
 *  pages the reader can't reach). */
const SCOPE: Record<DocsPage, DocsPage[]> = {
  "/docs": ["/docs", "/docs/accessibility"],
  "/docs/creator": ["/docs/creator", "/docs/accessibility"],
  "/docs/accessibility": ["/docs/accessibility"],
};

const PAGE_LABEL: Record<DocsPage, string> = {
  "/docs": "Docs",
  "/docs/creator": "Creator guide",
  "/docs/accessibility": "Accessibility",
};

const LISTBOX_ID = "docs-search-listbox";
const optionId = (item: DocsSearchItem) => `docs-opt-${item.id}`;

export function DocsSearch({ page }: { page: DocsPage }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => {
    const allowed = SCOPE[page];
    return buildDocsIndex().filter((it) => allowed.includes(it.page));
  }, [page]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return filterByQuery(index, query, (it) => [
      it.title,
      it.subtitle,
      ...it.keywords,
    ]).slice(0, 12);
  }, [index, query]);

  const showList = open && !!query.trim() && results.length > 0;
  const activeId = showList ? optionId(results[selected]) : undefined;

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const go = (item: DocsSearchItem | undefined) => {
    if (!item) return;
    setOpen(false);
    setQuery("");
    if (item.page === page && item.anchor) {
      const el = document.getElementById(item.anchor);
      if (el) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", `#${item.anchor}`);
        return;
      }
    }
    router.push(item.anchor ? `${item.page}#${item.anchor}` : item.page);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[selected]);
    }
  };

  return (
    <div
      ref={rootRef}
      className={styles.search}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className={styles.searchBar}>
        <Search className={styles.searchIcon} size={16} aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          className={styles.searchInput}
          placeholder="Search the docs…"
          aria-label="Search documentation"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            className={styles.searchClear}
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {/* Polite result count for screen readers. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {query.trim()
          ? results.length === 0
            ? `No matches for ${query}`
            : `${results.length} result${results.length === 1 ? "" : "s"}`
          : ""}
      </div>

      {open && query.trim() && (
        showList ? (
          <ul id={LISTBOX_ID} className={styles.searchResults} role="listbox" aria-label="Search results">
            {results.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  id={optionId(item)}
                  role="option"
                  aria-selected={idx === selected}
                  tabIndex={-1}
                  className={`${styles.searchResult} ${idx === selected ? styles.searchResultActive : ""}`}
                  onMouseMove={() => setSelected(idx)}
                  onClick={() => go(item)}
                >
                  <span className={styles.searchResultTitle}>{item.title}</span>
                  <span className={styles.searchResultMeta}>
                    <span className={styles.searchResultSub}>{item.subtitle}</span>
                    {item.page !== page && (
                      <span className={styles.searchResultPage}>
                        {PAGE_LABEL[item.page]}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.searchResults} role="presentation">
            <div className={styles.searchEmpty}>No matches for “{query}”.</div>
          </div>
        )
      )}
    </div>
  );
}
