/**
 * Error types every port shares. Adapters throw these; route handlers map
 * them to status codes in lib/server/http.ts.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export class PortError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown by every stub adapter: this integration point has no implementation. */
export class NotConfiguredError extends PortError {
  constructor(port: string, envVar: string, hint: string) {
    super(
      `${port} is not configured. Set ${envVar} to an adapter that implements it. ${hint}`,
      "NOT_CONFIGURED",
    );
  }
}

/** The adapter is wired but the capability is switched off (e.g. AI locally). */
export class CapabilityUnavailableError extends PortError {
  constructor(capability: string) {
    super(`${capability} is not available in this deployment.`, "CAPABILITY_UNAVAILABLE");
  }
}

export class NotFoundError extends PortError {
  constructor(what: string) {
    super(`${what} not found.`, "NOT_FOUND");
  }
}

export class ForbiddenError extends PortError {
  constructor(what: string) {
    super(`Not allowed: ${what}.`, "FORBIDDEN");
  }
}

export class ConflictError extends PortError {
  constructor(message: string, code: "SLUG_TAKEN" | "EMAIL_TAKEN" | "CONFLICT" = "CONFLICT") {
    super(message, code);
  }
}

export class GalleryLimitError extends PortError {
  constructor(readonly limit: number) {
    super(`Gallery limit of ${limit} reached.`, "GALLERY_LIMIT_REACHED");
  }
}

export class QuotaExceededError extends PortError {
  constructor(
    readonly used: number,
    readonly limit: number,
    readonly incoming: number,
  ) {
    super("Storage quota exceeded.", "QUOTA_EXCEEDED");
  }
}
