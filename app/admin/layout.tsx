/**
 * Admin section layout — role-gated shell with a slide-out drawer navigation.
 *
 * The nav lives in a fixed left drawer that slides in/out with an eased
 * transform. A hamburger button in the content header toggles it. Keyboard
 * accessible: Escape closes, Tab is trapped while open, focus restores to
 * the trigger on close.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Icon, type IconName } from "@/components/icon";
import { fetchAdminStatus, type AdminStatus } from "@/lib/admin-status";

type AdminSection = { href: string; label: string; icon: IconName };

// Admin sections grouped by function — drives the desktop sidebar and the
// mobile drawer. The first group (Overview) is unlabeled and pinned at top.
const SECTION_GROUPS: { label: string | null; sections: AdminSection[] }[] = [
  {
    label: null,
    sections: [{ href: "/admin", label: "Overview", icon: "overview" }],
  },
  {
    label: "Insights",
    sections: [
      { href: "/admin/analytics", label: "Analytics", icon: "analytics" },
      { href: "/admin/performance", label: "Performance", icon: "performance" },
      { href: "/admin/rate-limits", label: "Rate Limits", icon: "rate-limits" },
      { href: "/admin/content", label: "Content", icon: "content" },
    ],
  },
  {
    label: "People",
    sections: [
      { href: "/admin/users", label: "Users", icon: "users" },
      { href: "/admin/invites", label: "Invites", icon: "letter" },
      { href: "/admin/issues", label: "Tickets", icon: "bell" },
    ],
  },
  {
    label: "System",
    sections: [
      { href: "/admin/design", label: "Design", icon: "design" },
      { href: "/admin/banner", label: "Banner", icon: "pin" },
      { href: "/admin/settings", label: "Settings", icon: "puzzle" },
      { href: "/docs/admin", label: "Admin Guide", icon: "book" },
      { href: "/docs/changelog", label: "Changelog", icon: "book" },
    ],
  },
];

// Flat list derived from the groups — used for the current-section lookup.
const SECTIONS: AdminSection[] = SECTION_GROUPS.flatMap((g) => g.sections);

type ActorRole = "super_admin" | "admin" | "moderator";

/** Role chip — reused in the desktop sidebar header and the mobile top bar. */
function RoleBadge({
  actorRole,
  className,
}: {
  actorRole: ActorRole;
  className?: string;
}) {
  const accent =
    actorRole === "super_admin"
      ? "#eab308"
      : actorRole === "admin"
        ? "var(--fc-danger)"
        : "var(--fc-text-muted)";
  const bg =
    actorRole === "super_admin"
      ? "color-mix(in srgb, #eab308 18%, transparent)"
      : actorRole === "admin"
        ? "color-mix(in srgb, var(--fc-danger) 18%, transparent)"
        : "var(--fc-wash)";
  const borderColor =
    actorRole === "moderator" ? "var(--fc-border)" : accent;
  return (
    <span
      className={`inline-flex items-center leading-none text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${className ?? ""}`}
      style={{ background: bg, color: accent, border: `1px solid ${borderColor}` }}
      title={`You are signed in as ${actorRole.replace("_", " ")}`}
    >
      {actorRole === "super_admin"
        ? "Developer"
        : actorRole === "admin"
          ? "Admin"
          : "Moderator"}
    </span>
  );
}

/** Grouped nav (group header + items) shared by the sidebar and the drawer. */
function AdminNavGroups({
  pathname,
  pendingInvites,
  variant,
  onNavigate,
}: {
  pathname: string;
  pendingInvites: number;
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
}) {
  return (
    <>
      {SECTION_GROUPS.map((group, gi) => (
        <div key={group.label ?? `group-${gi}`} className={gi > 0 ? "mt-3" : ""}>
          {group.label && (
            <p
              className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--fc-text-muted)" }}
            >
              {group.label}
            </p>
          )}
          <ul>
            {group.sections.map((s) => {
              const isActive =
                s.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(s.href);
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className="flex items-center gap-3 px-4 py-2 text-sm transition-colors"
                    style={{
                      color: isActive ? "var(--fc-accent-on)" : "var(--fc-text)",
                      background: isActive ? "var(--fc-accent)" : "transparent",
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <Icon
                      name={s.icon}
                      size={variant === "sidebar" ? 16 : 18}
                      color={isActive ? "var(--fc-accent-on)" : "var(--fc-icon)"}
                    />
                    {s.label}
                    {s.href === "/admin/invites" && pendingInvites > 0 && (
                      <span
                        className="fc-admin-pending-dot ml-auto"
                        aria-label={`${pendingInvites} pending invite${pendingInvites === 1 ? "" : "s"}`}
                        title={`${pendingInvites} pending invite${pendingInvites === 1 ? "" : "s"} to review`}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<"loading" | "denied" | "authed">(
    "loading",
  );
  const [actorRole, setActorRole] = useState<
    "super_admin" | "admin" | "moderator" | null
  >(null);
  const [pendingInvites, setPendingInvites] = useState(0);
  // Mirror of `status` readable from effect closures without re-running them.
  const statusRef = useRef<"loading" | "denied" | "authed">("loading");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const pathname = usePathname();
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // Drawer open state is keyed by pathname — navigating automatically "closes"
  // it by deriving `drawerOpen` from whether the current key matches the
  // pathname at the time it was opened. This avoids a synchronous setState in
  // an effect on route change.
  const [drawer, setDrawer] = useState<{ open: boolean; path: string }>({
    open: false,
    path: pathname,
  });
  const drawerOpen = drawer.open && drawer.path === pathname;
  const setDrawerOpen = useCallback(
    (open: boolean) => {
      setDrawer({ open, path: pathname });
    },
    [pathname],
  );

  // Re-fetch on pathname change so the pending-invite badge stays current
  // as the admin navigates between admin sections (e.g. approves one on
  // /admin/invites then heads back to /admin — badge should decrement).
  // Goes through the cached helper, which rejects on 429/5xx (the endpoint
  // shares the 30/min admin rate-limit tier): a transient failure must not
  // demote an authed admin to "denied" — only authenticated:false does.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = (data: AdminStatus) => {
      if (data.authenticated) {
        setStatus("authed");
        setActorRole(data.role);
        setPendingInvites(data.pendingInvites);
      } else setStatus("denied");
    };
    const attempt = (retriesLeft: number) => {
      // No force: the helper's short TTL serves repeat navigations from cache,
      // keeping pressure off the shared 30/min admin budget. The badge is
      // cosmetic; the menu-open refresh (ProjectMenu) re-syncs it on demand.
      fetchAdminStatus()
        .then((data) => {
          if (!cancelled) apply(data);
        })
        .catch(() => {
          if (cancelled || statusRef.current !== "loading") return;
          // Keep "authed" on transient failure (handled by the guard above).
          // While still resolving the first load, retry once before giving
          // up — a one-off 429 shouldn't lock an admin out behind Denied.
          if (retriesLeft > 0) {
            timer = setTimeout(() => attempt(retriesLeft - 1), 1500);
          } else {
            setStatus("denied");
          }
        });
    };
    attempt(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  // Keyboard: Escape closes the drawer and restores focus to the trigger
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setDrawerOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Auto-focus the first nav link when opening
  useEffect(() => {
    if (!drawerOpen) return;
    requestAnimationFrame(() => {
      const firstLink =
        drawerRef.current?.querySelector<HTMLElement>("a[href]");
      firstLink?.focus();
    });
  }, [drawerOpen]);

  // Focus trap — Tab cycles within drawer while open
  const handleDrawerKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  const currentSection = SECTIONS.find((s) =>
    s.href === "/admin" ? pathname === "/admin" : pathname.startsWith(s.href),
  );

  // Unified outer wrapper across loading/denied/authed so React hydrates
  // the same DOM shape regardless of auth-check timing. Previously the
  // three branches returned independent trees, which caused a hydration
  // mismatch when the server's loading render didn't match the client's
  // post-auth render.
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-surface">
        <AppHeader />
        <div className="h-14 sm:h-16" />
        <div
          className="flex items-center justify-center py-20"
          style={{ color: "var(--fc-text-muted)" }}
        >
          Loading...
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-screen bg-surface">
        <AppHeader />
        <div className="h-14 sm:h-16" />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <h1
              className="text-xl font-semibold mb-2"
              style={{ color: "var(--fc-text)" }}
            >
              Access Denied
            </h1>
            <p className="mb-4" style={{ color: "var(--fc-text-muted)" }}>
              You need an admin role to access this page.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-5 py-2 rounded-lg text-sm font-medium transition-all active:scale-95"
              style={{
                background: "var(--fc-accent)",
                color: "var(--fc-accent-on)",
              }}
            >
              Back to app
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface fc-admin-compact">
      <AppHeader />
      <div className="h-14 sm:h-16" />

      {/* Mobile top bar — the hamburger IS the section title (icon + current
          section + chevron). Replaced by the persistent sidebar on ≥ md. */}
      <div
        className="md:hidden header-glass border-b sticky z-40 mt-1"
        style={{
          top: "calc(3.5rem + 0.25rem)",
          borderColor: "var(--fc-header-border)",
          paddingTop: "0.25rem",
        }}
      >
        <div className="px-4 sm:px-6 py-2 flex items-center gap-2">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open admin navigation"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            className="inline-flex items-center gap-2 rounded-lg transition-all active:scale-95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
            style={{
              background: "var(--fc-accent)",
              color: "var(--fc-accent-on)",
              border: "1px solid var(--fc-accent)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            }}
          >
            <Icon
              name={currentSection?.icon ?? "menu"}
              size={14}
              color="var(--fc-accent-on)"
            />
            {currentSection?.label ?? "Admin"}
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {actorRole && <RoleBadge actorRole={actorRole} className="ml-auto" />}
        </div>
      </div>

      {/* Desktop: persistent grouped sidebar + content. Mobile: content only
          (the drawer provides nav). */}
      <div className="md:flex md:items-start">
        <aside
          className="hidden md:flex md:flex-col md:flex-shrink-0 w-56 sticky overflow-y-auto mt-1"
          style={{
            top: "calc(3.5rem + 0.25rem)",
            height: "calc(100dvh - 3.75rem)",
            borderRight: "1px solid var(--fc-border)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--fc-border)" }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-wider leading-none"
              style={{ color: "var(--fc-text-muted)" }}
            >
              Admin
            </h2>
            {actorRole && <RoleBadge actorRole={actorRole} />}
          </div>
          <nav aria-label="Admin sections" className="flex-1 py-2">
            <AdminNavGroups
              pathname={pathname}
              pendingInvites={pendingInvites}
              variant="sidebar"
            />
          </nav>
        </aside>

        {/* Content area */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>

      {/* Backdrop — fades in/out */}
      <div
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
        className="fixed inset-0 z-[60] pointer-events-auto transition-opacity duration-300 ease-out"
        style={{
          background: "rgba(0,0,0,0.55)",
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? "auto" : "none",
        }}
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        id="admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
        onKeyDown={handleDrawerKeyDown}
        className="fixed top-0 left-0 bottom-0 z-[61] w-64 max-w-[85vw] flex flex-col"
        style={{
          background: "var(--fc-bg)",
          borderRight: "1px solid var(--fc-border)",
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: drawerOpen
            ? "4px 0 24px rgba(0,0,0,0.35)"
            : "none",
          willChange: "transform",
        }}
      >
        {/* Drawer header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--fc-border)" }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-wider leading-none"
            style={{ color: "var(--fc-text-muted)" }}
          >
            Admin
          </h2>
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              requestAnimationFrame(() => triggerRef.current?.focus());
            }}
            aria-label="Close admin navigation"
            className="inline-flex items-center justify-center rounded"
            style={{
              width: 24,
              height: 24,
            }}
          >
            <Icon name="arrow" size={14} color="var(--fc-text-muted)" />
          </button>
        </div>

        {/* Nav links — grouped (same renderer as the desktop sidebar) */}
        <nav
          aria-label="Admin sections"
          className="flex-1 overflow-y-auto py-2"
        >
          <AdminNavGroups
            pathname={pathname}
            pendingInvites={pendingInvites}
            variant="drawer"
            onNavigate={() => setDrawerOpen(false)}
          />
        </nav>

        {/* Drawer footer */}
        <div
          className="px-4 py-3 text-[10px]"
          style={{
            borderTop: "1px solid var(--fc-border)",
            color: "var(--fc-text-faint)",
          }}
        >
          Esc to close · ⇥ cycles focus
        </div>
      </aside>
    </div>
  );
}
