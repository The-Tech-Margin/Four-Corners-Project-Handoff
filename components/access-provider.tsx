/**
 * AccessProvider — single, app-wide source of auth + access state.
 *
 * Mounted once at the layout root, it runs the ONE Supabase auth subscription
 * and the ONE admin-status fetch for the whole app, exposing them via context.
 * The header and project menu consume this instead of each running their own
 * effects + module cache, which previously re-fetched on every per-page header
 * remount.
 *
 * Behavior is a faithful lift of the prior AppHeader/ProjectMenu logic:
 *  - dev-auth bypass seeds the user synchronously (no unauth flash),
 *  - a 1.5s timeout resolves `authLoading` on slow/mobile sessions,
 *  - admin status goes through the existing cached helper, which keeps prior
 *    state on 429/5xx so a rate-limited check never revokes admin UI.
 *
 * Admin status is stored keyed by the user id it was fetched for and derived
 * against the current user, so logout/user-switch never needs a synchronous
 * state reset inside an effect.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { DEV_USER, isDevAuthClient } from "@/lib/dev-auth";
import {
  fetchAdminStatus,
  clearAdminStatusCache,
  type AdminStatus,
} from "@/lib/admin-status";

export type AppRole = AdminStatus["role"];

export interface AccessState {
  user: User | null;
  authLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: AppRole;
  pendingInvites: number;
  /** Force-refresh the admin signal (e.g. when opening the menu). */
  refreshAccess: () => void;
}

const DEFAULT_STATE: AccessState = {
  user: null,
  authLoading: true,
  isAdmin: false,
  isSuperAdmin: false,
  role: null,
  pendingInvites: 0,
  refreshAccess: () => {},
};

// Default is the unauthenticated state so a stray consumer rendered outside the
// provider degrades gracefully instead of throwing.
const AccessContext = createContext<AccessState>(DEFAULT_STATE);

export function useAccess(): AccessState {
  return useContext(AccessContext);
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();

  // Dev auth bypass seeds the user synchronously so there's no unauthenticated
  // flash during hydration. Lazy init avoids a setState-in-effect; likewise
  // authLoading starts false when there is nothing to load.
  const [user, setUser] = useState<User | null>(() =>
    isDevAuthClient()
      ? ({ id: DEV_USER.id, email: DEV_USER.email } as User)
      : null,
  );
  const [authLoading, setAuthLoading] = useState(
    () => !isDevAuthClient() && !!supabase,
  );
  // Admin status tagged with the user it belongs to — derived below, so a
  // user change invalidates it without a synchronous reset.
  const [admin, setAdmin] = useState<{
    userId: string;
    status: AdminStatus;
  } | null>(null);

  // Single auth subscription for the whole app.
  useEffect(() => {
    // Dev auth bypass handled by the lazy initializer above; no client → the
    // authLoading initializer already resolved to false.
    if (isDevAuthClient() || !supabase) return;

    let mounted = true;
    const timeout = setTimeout(() => {
      if (mounted) setAuthLoading(false);
    }, 1500);

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) {
          setUser(data.session?.user ?? null);
          setAuthLoading(false);
          clearTimeout(timeout);
        }
      } catch {
        if (mounted) {
          setAuthLoading(false);
          clearTimeout(timeout);
        }
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
        if (!session?.user) {
          clearAdminStatusCache();
          setAdmin(null);
        }
      },
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Admin status follows the user. Keeps prior state on transient failure
  // (fetchAdminStatus rejects on 429/5xx); only an authoritative result mutates.
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let cancelled = false;
    fetchAdminStatus()
      .then((status) => {
        if (!cancelled) setAdmin({ userId, status });
      })
      .catch(() => {
        /* keep prior state on transient failure */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const refreshAccess = useCallback(() => {
    const userId = user?.id;
    if (!userId) return;
    fetchAdminStatus({ force: true })
      .then((status) => setAdmin({ userId, status }))
      .catch(() => {
        /* keep prior state on transient failure */
      });
  }, [user?.id]);

  // Derive against the current user — stale status from a previous user never
  // leaks across a login switch.
  const current = user?.id && admin?.userId === user.id ? admin.status : null;
  const role: AppRole = current?.role ?? null;

  const value: AccessState = {
    user,
    authLoading,
    isAdmin: current?.authenticated ?? false,
    isSuperAdmin: role === "super_admin",
    role,
    pendingInvites: current?.pendingInvites ?? 0,
    refreshAccess,
  };

  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}
