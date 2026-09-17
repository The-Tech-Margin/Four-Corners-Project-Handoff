/**
 * A small JSON document store for the local adapters: one file per
 * collection under the data directory, written atomically.
 *
 * Next compiles the proxy, server components and route handlers into
 * separate module graphs, so an in-memory cache alone would go stale. Every
 * read stats the file and reloads when inode, size or mtime moved; every
 * write goes through a lock file, so two graphs (or two processes) cannot
 * lose each other's updates.
 *
 * It is deliberately simple: fine for a laptop and a few thousand
 * documents, not a production database.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  renameSync,
  statSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

interface CacheEntry {
  statKey: string;
  rows: unknown[];
}

interface StoreGlobals {
  cache: Map<string, CacheEntry>;
  chains: Map<string, Promise<unknown>>;
}

const globals = globalThis as typeof globalThis & { __fcJsonStore?: StoreGlobals };
const state: StoreGlobals = (globals.__fcJsonStore ??= {
  cache: new Map(),
  chains: new Map(),
});

const LOCK_TIMEOUT_MS = 5000;
const LOCK_STALE_MS = 30000;
const LOCK_RETRY_MS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JsonStore<T> {
  private readonly file: string;
  private readonly lockFile: string;

  constructor(
    private readonly dataDir: string,
    private readonly name: string,
  ) {
    this.file = join(dataDir, "db", `${name}.json`);
    this.lockFile = join(dataDir, "db", `${name}.lock`);
    mkdirSync(join(dataDir, "db"), { recursive: true });
  }

  private statKey(): string {
    try {
      const s = statSync(this.file);
      return `${s.ino}:${s.mtimeMs}:${s.size}`;
    } catch {
      return "absent";
    }
  }

  private loadFromDisk(): T[] {
    if (!existsSync(this.file)) return [];
    const raw = readFileSync(this.file, "utf8");
    try {
      const parsed = JSON.parse(raw) as { rows?: T[] };
      return Array.isArray(parsed.rows) ? parsed.rows : [];
    } catch {
      const quarantine = `${this.file}.corrupt-${Date.now()}`;
      renameSync(this.file, quarantine);
      throw new Error(
        `${this.name}.json was not valid JSON. Moved it to ${quarantine} so nothing is overwritten.`,
      );
    }
  }

  /** Current rows, reloaded whenever the file changed underneath us. */
  read(): T[] {
    const key = this.statKey();
    const cached = state.cache.get(this.file);
    if (cached && cached.statKey === key) return cached.rows as T[];

    const rows = this.loadFromDisk();
    state.cache.set(this.file, { statKey: key, rows });
    return rows;
  }

  private writeRows(rows: T[]): void {
    const tmp = `${this.file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ version: 1, rows }, null, 2)}\n`, "utf8");
    renameSync(tmp, this.file);
    state.cache.set(this.file, { statKey: this.statKey(), rows });
  }

  private async acquireLock(): Promise<() => void> {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;

    for (;;) {
      try {
        const fd = openSync(this.lockFile, "wx");
        closeSync(fd);
        return () => {
          try {
            unlinkSync(this.lockFile);
          } catch {
            /* already gone */
          }
        };
      } catch {
        try {
          const age = Date.now() - statSync(this.lockFile).mtimeMs;
          if (age > LOCK_STALE_MS) unlinkSync(this.lockFile);
        } catch {
          /* lock vanished — retry immediately */
        }
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for the ${this.name} store lock.`);
        }
        await sleep(LOCK_RETRY_MS);
      }
    }
  }

  /**
   * Read-modify-write under the collection lock. The updater always sees
   * the rows currently on disk.
   */
  async mutate<R>(updater: (rows: T[]) => { rows: T[]; result: R }): Promise<R> {
    const previous = (state.chains.get(this.file) ?? Promise.resolve()) as Promise<unknown>;

    const run = previous.then(async () => {
      const release = await this.acquireLock();
      try {
        const current = this.loadFromDisk();
        const { rows, result } = updater(current);
        this.writeRows(rows);
        return result;
      } finally {
        release();
      }
    });

    state.chains.set(
      this.file,
      run.catch(() => undefined),
    );
    return run;
  }
}
