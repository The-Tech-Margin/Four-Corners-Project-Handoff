/**
 * HelpLauncherProvider — mounts the floating help widget.
 *
 * Renders a bottom-left FAB on the editor (/) and dashboard (/dashboard) only,
 * so it never overlays the editing surface or collides with the bottom-right
 * scroll-to-top control. Opens on FAB click, on the `fc:open-help` event, and
 * once on a user's first sign-in (remembered in localStorage). Reads the shared
 * access context rather than running its own auth subscription.
 *
 * @author @thetechmargin
 * @copyright 2026 TheTechMargin
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { useAccess } from "@/components/access-provider";
import { HelpLauncher } from "./HelpLauncher";

/** Event other components can dispatch to open the launcher. */
export const OPEN_HELP_EVENT = "fc:open-help";

const SEEN_KEY = "fc-help-launcher-seen";
const WIDGET_ROUTES = new Set(["/", "/dashboard"]);

export function HelpLauncherProvider() {
  const { user } = useAccess();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  const isAuthed = !!user;
  const showFab = pathname ? WIDGET_ROUTES.has(pathname) : false;

  // External open event (e.g. a future menu item or keyboard shortcut).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_HELP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_HELP_EVENT, onOpen);
  }, []);

  // First sign-in → open once, ever (per browser). Defer the open to a
  // microtask so we don't setState synchronously inside the effect body.
  useEffect(() => {
    if (!isAuthed || !showFab || autoOpenedRef.current) return;
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = true; // storage unavailable → don't auto-open
    }
    if (seen) return;
    autoOpenedRef.current = true;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    queueMicrotask(() => setOpen(true));
  }, [isAuthed, showFab]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {showFab && !open && (
        <button
          type="button"
          className="fc-help-fab"
          aria-label="Help"
          aria-haspopup="dialog"
          title="Help"
          onClick={() => setOpen(true)}
        >
          <CircleHelp className="w-6 h-6" aria-hidden />
        </button>
      )}
      {open && (
        <HelpLauncher isAuthed={isAuthed} onClose={close} />
      )}
    </>
  );
}
