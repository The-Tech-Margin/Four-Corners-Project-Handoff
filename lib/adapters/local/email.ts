/**
 * Local email: prints the message to the server console. Password resets
 * work on a laptop without a mail provider — the link is in the dev log.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { EmailPort } from "@/lib/ports/email";

export function createLocalEmail(): EmailPort {
  return {
    capabilities: { delivery: false },
    async send(message) {
      const body = message.text ?? message.html.replace(/<[^>]+>/g, " ");
      console.info(
        [
          "",
          "── email (not delivered: local adapter) ──",
          `to:      ${message.to}`,
          `subject: ${message.subject}`,
          body.replace(/\s+/g, " ").trim(),
          "─────────────────────────────────────────",
          "",
        ].join("\n"),
      );
      return {};
    },
  };
}
