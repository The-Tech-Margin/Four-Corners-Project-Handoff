/**
 * Transactional email (password resets today). The local adapter prints the
 * message to the server console, which is enough to finish a reset locally.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailPort {
  /** False when messages are logged rather than delivered. */
  readonly capabilities: { delivery: boolean };
  send(message: EmailMessage): Promise<{ id?: string }>;
}
