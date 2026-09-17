/**
 * HelpLauncher — the centered, command-palette-style help overlay.
 *
 * A search box plus categorised, keyboard-navigable rows that surface the same
 * help/navigation destinations as the menu help. Implemented as a WAI-ARIA
 * combobox-with-listbox-popup: focus stays in the input, ArrowUp/Down move the
 * active option (announced via aria-activedescendant), Enter activates, Escape
 * closes, and Tab is trapped within the dialog. Colours resolve from --fc-*
 * tokens so the overlay tracks dark/light mode and persona palette overrides.
 *
 * @author @thetechmargin
 * @copyright 2026 TheTechMargin
 */
"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Accessibility,
  BookOpen,
  Braces,
  CircleHelp,
  Eye,
  Frame,
  Images,
  LayoutGrid,
  List,
  LogIn,
  Palette,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  SquarePen,
  X,
  type LucideIcon,
} from "lucide-react";
import Modal from "@/components/modal";
import {
  buildHelpEntries,
  filterHelpEntries,
  HELP_CATEGORY_ORDER,
  type HelpEntry,
  type HelpIconName,
} from "@/lib/help-entries";

const ICONS: Record<HelpIconName, LucideIcon> = {
  images: Images,
  plus: Plus,
  login: LogIn,
  editor: SquarePen,
  dashboard: LayoutGrid,
  rocket: Rocket,
  corners: Frame,
  eye: Eye,
  list: List,
  api: Braces,
  accessibility: Accessibility,
  book: BookOpen,
  palette: Palette,
  admin: Settings,
  shield: ShieldCheck,
};

const LISTBOX_ID = "help-launcher-listbox";
const optionId = (entry: HelpEntry) => `help-opt-${entry.id}`;

interface HelpLauncherProps {
  isAuthed: boolean;
  isAdmin: boolean;
  onClose: () => void;
}

export function HelpLauncher({ isAuthed, isAdmin, onClose }: HelpLauncherProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const trapRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const allEntries = useMemo(
    () => buildHelpEntries({ isAuthed, isAdmin }),
    [isAuthed, isAdmin],
  );
  const results = useMemo(
    () => filterHelpEntries(allEntries, query),
    [allEntries, query],
  );
  const groups = useMemo(
    () =>
      HELP_CATEGORY_ORDER.map((category) => ({
        category,
        items: results.filter((e) => e.category === category),
      })).filter((g) => g.items.length > 0),
    [results],
  );
  // Flat list mirrors render order so the index drives keyboard selection.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const activeId = flat[selected] ? optionId(flat[selected]) : undefined;

  // Reset the highlight whenever the query changes (set alongside the query so
  // we don't bounce selection through an effect).
  const changeQuery = (value: string) => {
    setQuery(value);
    setSelected(0);
  };

  // Capture the opener, move focus into the input, and restore focus to the
  // opener (the FAB) when the dialog unmounts — APG modal dialog behaviour.
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => openerRef.current?.focus();
  }, []);

  // Keep the active option scrolled into view (no smooth motion → no a11y risk).
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const activate = (entry: HelpEntry | undefined) => {
    if (!entry) return;
    onClose();
    if (entry.action.type === "route") {
      router.push(entry.action.href);
    } else if (entry.action.type === "external") {
      window.open(entry.action.href, "_blank", "noopener,noreferrer");
    } else {
      window.dispatchEvent(new CustomEvent(entry.action.name));
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(flat[selected]);
    } else if (e.key === "Tab") {
      // Trap focus among the dialog's real tab stops (input + clear button);
      // options are reached via the arrow-key/aria-activedescendant model.
      const focusables = Array.from(
        trapRef.current?.querySelectorAll<HTMLElement>("input, button") ?? [],
      ).filter((el) => el.offsetParent !== null && el.tabIndex !== -1);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Help" showHeader={false} maxWidth="2xl">
      <div ref={trapRef} onKeyDown={onKeyDown}>
        <div
          className="flex items-center gap-2 px-4 sm:px-5 h-14 border-b"
          style={{ borderColor: "var(--fc-border)" }}
        >
          <Search className="w-4 h-4 shrink-0 modal-text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder="Search help & jump to anything…"
            aria-label="Search help"
            className="fc-help-search flex-1 min-w-0 bg-transparent border-0 outline-none text-sm"
            style={{ color: "var(--fc-text)" }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                changeQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="w-7 h-7 flex items-center justify-center rounded modal-text-muted hover:modal-text"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          ) : (
            <kbd
              className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium modal-text-muted border"
              style={{ borderColor: "var(--fc-border)" }}
              aria-hidden
            >
              Esc
            </kbd>
          )}
        </div>

        {/* Polite result count for screen readers (announces on query change). */}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {flat.length === 0
            ? `No results for ${query}`
            : `${flat.length} result${flat.length === 1 ? "" : "s"}`}
        </span>

        <div
          ref={listRef}
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Help results"
          className="max-h-[60vh] overflow-y-auto py-2"
        >
          {flat.length === 0 ? (
            <p role="presentation" className="px-5 py-10 text-center text-sm modal-text-muted">
              No results for “{query}”.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.category} role="group" aria-label={group.category} className="mb-1">
                <div className="px-5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider modal-text-muted">
                  {group.category}
                </div>
                {group.items.map((entry) => {
                  const idx = flat.indexOf(entry);
                  const Icon = ICONS[entry.icon] ?? CircleHelp;
                  const isSelected = idx === selected;
                  return (
                    <button
                      key={entry.id}
                      id={optionId(entry)}
                      data-idx={idx}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={-1}
                      onClick={() => activate(entry)}
                      onMouseMove={() => setSelected(idx)}
                      className="w-full flex items-center gap-3 px-5 py-2 text-left transition-colors"
                      style={{
                        background: isSelected ? "var(--fc-wash-hover)" : "transparent",
                        boxShadow: isSelected ? "inset 3px 0 0 0 var(--fc-accent)" : undefined,
                      }}
                    >
                      <span
                        className="flex items-center justify-center w-7 h-7 shrink-0"
                        style={{ color: `var(${entry.accentToken})` }}
                      >
                        <Icon className="w-[18px] h-[18px]" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span
                          className="block text-sm font-semibold truncate"
                          style={{ color: "var(--fc-text)" }}
                        >
                          {entry.title}
                        </span>
                        <span
                          className="block text-xs truncate"
                          style={{ color: "var(--fc-text-secondary)" }}
                        >
                          {entry.subtitle}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
