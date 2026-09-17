/**
 * Auth calls from the browser.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { SessionResponse } from "@/lib/api-contract/auth";
import { apiGet, apiSend } from "./http";

export interface AuthUser {
  id: string;
  email: string;
}

export const getSession = (): Promise<SessionResponse> => apiGet("/api/auth/session");

export const signIn = (email: string, password: string): Promise<{ user: AuthUser }> =>
  apiSend("/api/auth/sign-in", "POST", { email, password });

export const signUp = (email: string, password: string): Promise<{ user: AuthUser }> =>
  apiSend("/api/auth/sign-up", "POST", { email, password });

export const signOut = (): Promise<{ ok: true }> => apiSend("/api/auth/sign-out", "POST");

export const requestPasswordReset = (email: string): Promise<{ ok: true }> =>
  apiSend("/api/auth/password/forgot", "POST", { email });

export const resetPassword = (token: string, password: string): Promise<{ user: AuthUser }> =>
  apiSend("/api/auth/password/reset", "POST", { token, password });
