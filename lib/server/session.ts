/**
 * Who is making this request. Route handlers call `requireUser` first; a
 * null result is a 401 before any work happens.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { cookies } from "next/headers";
import { getServices } from "@/lib/adapters";
import type { SessionUser } from "@/lib/ports/auth";

export async function getServerUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getServices().auth.getSessionUser({
    get: (name) => store.get(name)?.value,
  });
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getServerUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
