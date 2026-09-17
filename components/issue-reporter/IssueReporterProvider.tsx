/**
 * IssueReporterProvider — mounts the in-app issue reporter.
 *
 * Renders nothing for logged-out users. For signed-in creators it installs
 * the console diagnostics buffer, binds the `Shift+I` shortcut, listens for
 * the `fc:open-issue-reporter` event (fired by the header menu item), and
 * renders the modal. No floating launcher — it collided with other
 * bottom-right controls; entry points are the menu item and Shift+I.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isDevAuthClient } from "@/lib/dev-auth";
import { installConsoleBuffer } from "@/lib/console-buffer";
import { installInteractionBuffer } from "@/lib/interaction-buffer";
import { installNetworkBuffer } from "@/lib/network-buffer";
import { IssueReportModal } from "./IssueReportModal";

/** Event other components dispatch to open the reporter (e.g. menu item). */
export const OPEN_ISSUE_REPORTER_EVENT = "fc:open-issue-reporter";

export function IssueReporterProvider() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Diagnostics buffers must start capturing as early as possible.
  useEffect(() => {
    installConsoleBuffer();
    installInteractionBuffer();
    installNetworkBuffer();
  }, []);

  // Track auth — dev-auth bypass counts as signed in.
  useEffect(() => {
    let cancelled = false;

    if (isDevAuthClient()) {
      // Defer so we don't set state synchronously within the effect body.
      queueMicrotask(() => {
        if (cancelled) return;
        setIsAuthed(true);
        setEmail("dev@localhost");
      });
      return () => {
        cancelled = true;
      };
    }

    const supabase = createClient();
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        if (cancelled) return;
        setIsAuthed(!!data.session?.user);
        setEmail(data.session?.user?.email ?? null);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setIsAuthed(!!session?.user);
        setEmail(session?.user?.email ?? null);
      },
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Shift+I shortcut + external open event.
  useEffect(() => {
    if (!isAuthed) return;

    const onKey = (e: KeyboardEvent) => {
      // Never collide with devtools (Cmd/Ctrl+Shift+I) or other modifiers.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!e.shiftKey || e.key.toLowerCase() !== "i") return;

      // Ignore while typing in a field.
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      ) {
        return;
      }

      e.preventDefault();
      setOpen(true);
    };

    const onOpenEvent = () => setOpen(true);

    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_ISSUE_REPORTER_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_ISSUE_REPORTER_EVENT, onOpenEvent);
    };
  }, [isAuthed]);

  if (!isAuthed || !open) return null;

  return (
    <IssueReportModal defaultEmail={email} onClose={() => setOpen(false)} />
  );
}
