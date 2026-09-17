/**
 * Console / error ring buffer for issue diagnostics.
 *
 * A module-level singleton that, once installed, captures the most recent
 * console.error / console.warn calls plus uncaught errors and unhandled
 * promise rejections. Bounded so it never grows without limit and never
 * retains references to large objects (everything is stringified + truncated).
 *
 * Privacy: only message text is kept. We never read cookies, tokens, or
 * localStorage here. Callers should still avoid logging secrets.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export interface ConsoleEntry {
  level: "error" | "warn";
  message: string;
  /** ms since epoch */
  ts: number;
  source?: string;
  /** First few stack frames when an Error object was available */
  stack?: string;
}

const MAX_ENTRIES = 50;
const MAX_MESSAGE_CHARS = 1000;
const MAX_STACK_LINES = 5;
const MAX_STACK_CHARS = 600;

const buffer: ConsoleEntry[] = [];
let installed = false;

/** Trim a stack trace to its first few frames so entries stay small. */
function truncateStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack
    .split("\n")
    .slice(0, MAX_STACK_LINES)
    .join("\n")
    .slice(0, MAX_STACK_CHARS);
}

function push(
  level: ConsoleEntry["level"],
  message: string,
  source?: string,
  stack?: string,
) {
  buffer.push({
    level,
    message: message.slice(0, MAX_MESSAGE_CHARS),
    ts: Date.now(),
    source,
    stack: truncateStack(stack),
  });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

function stringifyArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/**
 * Install the buffer once. Safe to call repeatedly (no-ops after the first)
 * and a no-op on the server. Wraps console.error/warn and listens for global
 * error events; the original console methods are still invoked.
 */
export function installConsoleBuffer(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    const firstError = args.find((a): a is Error => a instanceof Error);
    push("error", stringifyArgs(args), "console", firstError?.stack);
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    push("warn", stringifyArgs(args), "console");
    origWarn(...args);
  };

  window.addEventListener("error", (e: ErrorEvent) => {
    const where = e.filename
      ? ` (${e.filename}:${e.lineno}:${e.colno})`
      : "";
    push(
      "error",
      `${e.message}${where}`,
      "window.onerror",
      e.error instanceof Error ? e.error.stack : undefined,
    );
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    const msg =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : stringifyArgs([reason]);
    push(
      "error",
      msg,
      "unhandledrejection",
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}

/** Snapshot of the current buffer (most recent last). */
export function getConsoleEntries(): ConsoleEntry[] {
  return buffer.slice();
}
