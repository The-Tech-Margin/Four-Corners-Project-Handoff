/**
 * Email stub.
 *
 * A production adapter delivers transactional mail — today that is password
 * resets, so a failure locks people out of their accounts.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { EmailPort } from "@/lib/ports/email";
import { NotConfiguredError } from "@/lib/ports/errors";

const fail = (): never => {
  throw new NotConfiguredError(
    "EmailPort",
    "FC_EMAIL_ADAPTER",
    "Implement lib/ports/email.ts against your mail provider.",
  );
};

export function createStubEmail(): EmailPort {
  return {
    capabilities: { delivery: true },
    send: fail,
  };
}
