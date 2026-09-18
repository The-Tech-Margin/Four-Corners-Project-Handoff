/**
 * Request shapes shared by the auth routes and the browser client, so both
 * sides validate the same thing.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { z } from "zod";

export const CredentialsSchema = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(1).max(200),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().min(3).max(320),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(10).max(400),
  password: z.string().min(1).max(200),
});

export interface SessionResponse {
  user: { id: string; email: string } | null;
}
