/**
 * AccessProvider — single, app-wide source of auth state.
 *
 * Mounted once at the layout root. It holds the session, exposes the auth
 * actions, and lets components subscribe to sign-in and sign-out instead of
 * each running its own check. Sessions are shared across tabs through a
 * BroadcastChannel, so signing out in one tab signs out the others.
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
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "@/lib/api-client/auth";
import { ApiError } from "@/lib/api-client/http";

export interface AccessUser {
  id: string;
  email: string;
}

export type AuthEvent =
  | { type: "SIGNED_IN"; user: AccessUser; fresh: boolean }
  | { type: "SIGNED_OUT" };

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  code?: string;
}

export interface AccessState {
  user: AccessUser | null;
  authLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  resetPassword: (token: string, password: string) => Promise<AuthActionResult>;
  refresh: () => Promise<AccessUser | null>;
  /** Called on sign-in and sign-out; returns an unsubscribe function. */
  subscribe: (listener: (event: AuthEvent) => void) => () => void;
}

const noop = async (): Promise<AuthActionResult> => ({ ok: false, error: "Not ready" });

const DEFAULT_STATE: AccessState = {
  user: null,
  authLoading: true,
  signIn: noop,
  signUp: noop,
  signOut: async () => {},
  requestPasswordReset: noop,
  resetPassword: noop,
  refresh: async () => null,
  subscribe: () => () => {},
};

// Default is the signed-out state so a stray consumer rendered outside the
// provider degrades gracefully instead of throwing.
const AccessContext = createContext<AccessState>(DEFAULT_STATE);

export function useAccess(): AccessState {
  return useContext(AccessContext);
}

const CHANNEL = "fc-auth";

function describe(error: unknown): AuthActionResult {
  if (error instanceof ApiError) return { ok: false, error: error.message, code: error.code };
  return { ok: false, error: "Something went wrong. Try again." };
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccessUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const listeners = useRef(new Set<(event: AuthEvent) => void>());
  const loadedOnce = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  // Mirrors `user` so a transition can be detected without comparing inside a
  // state updater — React runs those during render, and subscribers set state.
  const currentUser = useRef<AccessUser | null>(null);

  const emit = useCallback((event: AuthEvent) => {
    for (const listener of listeners.current) listener(event);
  }, []);

  const applyUser = useCallback(
    (next: AccessUser | null, options: { broadcast?: boolean } = {}) => {
      const previous = currentUser.current;
      const changed = previous?.id !== next?.id;

      currentUser.current = next;
      setUser(next);

      if (changed) {
        if (next) emit({ type: "SIGNED_IN", user: next, fresh: loadedOnce.current });
        else if (previous) emit({ type: "SIGNED_OUT" });
      }

      if (options.broadcast) channel.current?.postMessage({ type: "session-changed" });
    },
    [emit],
  );

  const refresh = useCallback(async (): Promise<AccessUser | null> => {
    try {
      const { user: next } = await authApi.getSession();
      applyUser(next);
      return next;
    } catch {
      applyUser(null);
      return null;
    } finally {
      loadedOnce.current = true;
      setAuthLoading(false);
    }
  }, [applyUser]);

  useEffect(() => {
    let active = true;
    // Slow or offline sessions should not hold the UI in a loading state.
    const timeout = setTimeout(() => {
      if (active) setAuthLoading(false);
    }, 1500);

    void refresh().finally(() => clearTimeout(timeout));

    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(CHANNEL);
      channel.current.onmessage = () => {
        void refresh();
      };
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearTimeout(timeout);
      channel.current?.close();
      channel.current = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const value = useMemo<AccessState>(
    () => ({
      user,
      authLoading,
      async signIn(email, password) {
        try {
          const { user: next } = await authApi.signIn(email, password);
          applyUser(next, { broadcast: true });
          return { ok: true };
        } catch (error) {
          return describe(error);
        }
      },
      async signUp(email, password) {
        try {
          const { user: next } = await authApi.signUp(email, password);
          applyUser(next, { broadcast: true });
          return { ok: true };
        } catch (error) {
          return describe(error);
        }
      },
      async signOut() {
        try {
          await authApi.signOut();
        } finally {
          applyUser(null, { broadcast: true });
        }
      },
      async requestPasswordReset(email) {
        try {
          await authApi.requestPasswordReset(email);
          return { ok: true };
        } catch (error) {
          return describe(error);
        }
      },
      async resetPassword(token, password) {
        try {
          const { user: next } = await authApi.resetPassword(token, password);
          applyUser(next, { broadcast: true });
          return { ok: true };
        } catch (error) {
          return describe(error);
        }
      },
      refresh,
      subscribe(listener) {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    }),
    [user, authLoading, applyUser, refresh],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
