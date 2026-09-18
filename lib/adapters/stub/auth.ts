/**
 * Auth stub.
 *
 * A production adapter must:
 *  - store password hashes only (or delegate to an identity provider);
 *  - issue a session credential the proxy can verify without a data lookup,
 *    and that `getSessionUser` can revoke after a password change;
 *  - keep `requestPasswordReset` silent about whether an address exists;
 *  - make reset tokens single-use and short-lived.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { AuthPort } from "@/lib/ports/auth";
import { NotConfiguredError } from "@/lib/ports/errors";

const fail = (): never => {
  throw new NotConfiguredError(
    "AuthPort",
    "FC_AUTH_ADAPTER",
    "Implement lib/ports/auth.ts against your identity provider.",
  );
};

export function createStubAuth(): AuthPort {
  return {
    capabilities: { signUp: true, passwordReset: true },
    getSessionUser: fail,
    peekSession: fail,
    signUp: fail,
    signIn: fail,
    signOut: fail,
    requestPasswordReset: fail,
    consumePasswordReset: fail,
  };
}
