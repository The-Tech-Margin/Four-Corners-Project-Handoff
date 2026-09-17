/**
 * Row builder for the floating help launcher.
 *
 * Pure so the authenticated / unauthenticated / admin gating is unit-testable
 * without React. The launcher component maps `icon` to a lucide glyph and
 * `accentToken` to a --fc-corner-* variable, so row colours follow the active
 * persona palette (dark/light + overrides) automatically.
 *
 * @author @thetechmargin
 * @copyright 2026 TheTechMargin
 */
import { filterByQuery } from "@/lib/help-search";

export type HelpCategory =
  | "Get started"
  | "Workspace"
  | "Help"
  | "Design"
  | "Admin";

/** Render order of the launcher's category groups. */
export const HELP_CATEGORY_ORDER: HelpCategory[] = [
  "Get started",
  "Workspace",
  "Help",
  "Design",
  "Admin",
];

export type HelpIconName =
  | "images"
  | "plus"
  | "login"
  | "editor"
  | "dashboard"
  | "rocket"
  | "corners"
  | "eye"
  | "list"
  | "api"
  | "accessibility"
  | "book"
  | "palette"
  | "admin"
  | "shield";

export type HelpAction =
  | { type: "route"; href: string }
  | { type: "external"; href: string }
  | { type: "event"; name: string };

/** External published API reference. Mirrors the menu "API Docs" link: the
 *  Vercel env var wins when set; the default is the published Postman docs. */
const API_DOCS_URL =
  process.env.NEXT_PUBLIC_API_DOCS_URL ||
  "https://documenter.getpostman.com/view/54883007/2sBXqRiwAo#intro";

export interface HelpEntry {
  id: string;
  category: HelpCategory;
  title: string;
  subtitle: string;
  icon: HelpIconName;
  /** A --fc-corner-* token; the row icon inherits the active persona colour. */
  accentToken: string;
  keywords: string[];
  action: HelpAction;
}

export interface HelpEntryContext {
  isAuthed: boolean;
  isAdmin: boolean;
}

const CONTEXT = "--fc-corner-context";
const BACKSTORY = "--fc-corner-backstory";
const LINKS = "--fc-corner-links";
const CC = "--fc-corner-cc";

/**
 * Build the launcher rows for the current access state. Help destinations
 * mirror the menu "Help" paradigm: signed-out points at /docs, signed-in at the
 * comprehensive /docs/creator, and admins additionally get the Admin group.
 */
export function buildHelpEntries({ isAuthed, isAdmin }: HelpEntryContext): HelpEntry[] {
  const docsPage = isAuthed ? "/docs/creator" : "/docs";
  const entries: HelpEntry[] = [];

  // Get started
  if (isAuthed) {
    entries.push({ id: "new-project", category: "Get started", title: "New project", subtitle: "Start a project in the editor", icon: "plus", accentToken: CONTEXT, keywords: ["create", "new", "start", "upload"], action: { type: "route", href: "/" } });
  } else {
    entries.push({ id: "sign-in", category: "Get started", title: "Sign in", subtitle: "Request access or sign in to create", icon: "login", accentToken: CONTEXT, keywords: ["login", "account", "access", "request"], action: { type: "route", href: "/?auth=required" } });
  }
  entries.push({ id: "gallery", category: "Get started", title: "Browse the gallery", subtitle: "Explore published Four Corners work", icon: "images", accentToken: BACKSTORY, keywords: ["gallery", "browse", "explore", "public"], action: { type: "route", href: "/gallery" } });

  // Workspace (signed-in)
  if (isAuthed) {
    entries.push(
      { id: "editor", category: "Workspace", title: "Editor", subtitle: "Build a project across the four corners", icon: "editor", accentToken: CONTEXT, keywords: ["editor", "edit", "build", "canvas"], action: { type: "route", href: "/" } },
      { id: "dashboard", category: "Workspace", title: "Dashboard", subtitle: "Your projects and drafts", icon: "dashboard", accentToken: LINKS, keywords: ["dashboard", "projects", "drafts", "my work"], action: { type: "route", href: "/dashboard" } },
    );
  }

  // Help — same destinations as the menu help, gated like the docs pages
  entries.push(
    { id: "help-getting-started", category: "Help", title: "Getting started", subtitle: "From request to published", icon: "rocket", accentToken: CONTEXT, keywords: ["getting started", "account", "publish", "steps"], action: { type: "route", href: `${docsPage}#getting-started` } },
    { id: "help-four-corners", category: "Help", title: "The four corners", subtitle: "Context, Backstory, Related Imagery, Links", icon: "corners", accentToken: BACKSTORY, keywords: ["four corners", "context", "backstory", "related imagery", "links"], action: { type: "route", href: `${docsPage}#four-corners` } },
  );
  if (isAuthed) {
    entries.push(
      { id: "help-publishing", category: "Help", title: "Saving, drafts & publishing", subtitle: "How visibility works", icon: "eye", accentToken: LINKS, keywords: ["publish", "draft", "visibility", "gallery"], action: { type: "route", href: "/docs/creator#publishing" } },
      { id: "help-field-reference", category: "Help", title: "Field reference", subtitle: "Every corner's fields", icon: "list", accentToken: CC, keywords: ["fields", "reference", "metadata"], action: { type: "route", href: "/docs/creator#field-reference" } },
      { id: "help-api", category: "Help", title: "Public API", subtitle: "Read-only gallery API", icon: "api", accentToken: CONTEXT, keywords: ["api", "rest", "json", "developers"], action: { type: "route", href: "/docs/creator#api" } },
      { id: "api-docs", category: "Help", title: "API reference", subtitle: "Browsable endpoints & examples — opens in a new tab", icon: "api", accentToken: BACKSTORY, keywords: ["api", "reference", "postman", "endpoints", "external"], action: { type: "external", href: API_DOCS_URL } },
    );
  }
  entries.push(
    { id: "help-accessibility", category: "Help", title: "Accessibility", subtitle: "Keyboard & screen-reader guide", icon: "accessibility", accentToken: BACKSTORY, keywords: ["accessibility", "keyboard", "screen reader", "a11y"], action: { type: "route", href: "/docs/accessibility" } },
    { id: "help-full-guide", category: "Help", title: "Full help guide", subtitle: "Open the complete documentation", icon: "book", accentToken: LINKS, keywords: ["docs", "documentation", "guide", "help"], action: { type: "route", href: docsPage } },
  );

  // Design (signed-in)
  if (isAuthed) {
    entries.push({ id: "theme", category: "Design", title: "Theme & palette", subtitle: "Colours, dark mode and persona", icon: "palette", accentToken: CC, keywords: ["theme", "palette", "colours", "colors", "persona", "dark mode"], action: { type: "event", name: "fc:open-palette" } });
  }

  // Admin (admin / super_admin)
  if (isAdmin) {
    entries.push(
      { id: "admin-dashboard", category: "Admin", title: "Admin dashboard", subtitle: "Stats, users, invites, settings", icon: "admin", accentToken: CONTEXT, keywords: ["admin", "dashboard", "users", "invites", "settings"], action: { type: "route", href: "/admin" } },
      { id: "admin-guide", category: "Admin", title: "Admin guide", subtitle: "What each back-office section does", icon: "shield", accentToken: CC, keywords: ["admin", "guide", "roles", "back office"], action: { type: "route", href: "/docs/admin" } },
    );
  }

  return entries;
}

/** Narrow launcher rows by a query across title, subtitle, and keywords. */
export function filterHelpEntries(entries: HelpEntry[], query: string): HelpEntry[] {
  return filterByQuery(entries, query, (e) => [e.title, e.subtitle, ...e.keywords]);
}
