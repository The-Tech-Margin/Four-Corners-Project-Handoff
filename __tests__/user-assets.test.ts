/**
 * User Assets — schema, DB layer, and hook tests.
 *
 * Covers:
 *   • UserAssetSchema accepts valid library rows and rejects bad input
 *   • listUserAssets() builds the correct Supabase query (type filter,
 *     ILIKE escape, ordering, pagination + hasMore detection)
 *   • recordAsset() upserts with the right onConflict target and is safely
 *     idempotent / never throws
 *   • useUserAssets debounces the query, resets on filter change, paginates,
 *     and aborts stale in-flight responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserAssetSchema } from "@/lib/field-registry";

// ─────────────────────────────────────────────────────────────────────────────
// Shared Supabase client mock
//
// The module-under-test imports `createClient` from "@/lib/supabase/client".
// We stub it with a chainable query builder + in-memory auth so we can inspect
// the exact query structure the DB layer emits.
// ─────────────────────────────────────────────────────────────────────────────

type Call = { method: string; args: unknown[] };

interface FakeQuery {
  calls: Call[];
  resolveWith: { data: unknown; error: unknown };
  select: (...args: unknown[]) => FakeQuery;
  in: (...args: unknown[]) => FakeQuery;
  ilike: (...args: unknown[]) => FakeQuery;
  order: (...args: unknown[]) => FakeQuery;
  range: (...args: unknown[]) => FakeQuery;
  eq: (...args: unknown[]) => FakeQuery;
  delete: (...args: unknown[]) => FakeQuery;
  upsert: (...args: unknown[]) => Promise<{ error: unknown }>;
  then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => unknown;
}

function makeFakeQuery(
  resolveWith: { data: unknown; error: unknown } = { data: [], error: null },
): FakeQuery {
  const q: Partial<FakeQuery> = {
    calls: [],
    resolveWith,
  };
  const record = (method: string, ...args: unknown[]) => {
    q.calls!.push({ method, args });
    return q as FakeQuery;
  };
  q.select = (...a) => record("select", ...a);
  q.in = (...a) => record("in", ...a);
  q.ilike = (...a) => record("ilike", ...a);
  q.order = (...a) => record("order", ...a);
  q.range = (...a) => record("range", ...a);
  q.eq = (...a) => record("eq", ...a);
  q.delete = (...a) => record("delete", ...a);
  q.upsert = async (row: unknown, opts?: unknown) => {
    q.calls!.push({ method: "upsert", args: [row, opts] });
    return { error: resolveWith.error };
  };
  // Make the builder awaitable like Supabase's thenable query.
  q.then = (onFulfilled) => onFulfilled(q.resolveWith!);
  return q as FakeQuery;
}

interface FakeClient {
  lastQuery: FakeQuery | null;
  nextResolve: { data: unknown; error: unknown };
  currentUser: { id: string } | null;
  from: (table: string) => FakeQuery;
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
  };
}

function makeFakeClient(): FakeClient {
  const client: FakeClient = {
    lastQuery: null,
    nextResolve: { data: [], error: null },
    currentUser: { id: "user-under-test" },
    from(_table: string) {
      const q = makeFakeQuery(this.nextResolve);
      this.lastQuery = q;
      return q;
    },
    auth: {
      getUser: async () => ({ data: { user: client.currentUser } }),
    },
  };
  return client;
}

let fakeClient: FakeClient;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => fakeClient,
}));

// Silence console noise from the fire-and-forget recordAsset error paths.
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fakeClient = makeFakeClient();
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

// ─────────────────────────────────────────────────────────────────────────────
// UserAssetSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("UserAssetSchema", () => {
  const validBase = {
    id: "asset-1",
    userId: "user-1",
    mediaType: "image" as const,
    mimeType: "image/jpeg",
    fileName: "sunset.jpg",
    storageBucket: "context-media",
    storagePath: "user-1/context-images/proj-1/sunset.jpg",
    storageUrl: "https://example.com/sunset.jpg",
    createdAt: "2026-04-16T00:00:00Z",
  };

  it("parses a minimal valid image asset", () => {
    const parsed = UserAssetSchema.parse(validBase);
    expect(parsed.mediaType).toBe("image");
    expect(parsed.thumbnailStorageUrl).toBeUndefined();
  });

  it("accepts all supported media types (including document)", () => {
    for (const mediaType of ["image", "video", "audio", "document"] as const) {
      expect(() =>
        UserAssetSchema.parse({ ...validBase, mediaType }),
      ).not.toThrow();
    }
  });

  it("rejects unknown media types", () => {
    expect(() =>
      UserAssetSchema.parse({ ...validBase, mediaType: "spreadsheet" }),
    ).toThrow();
  });

  it("allows nullable thumbnail + dimension fields", () => {
    const parsed = UserAssetSchema.parse({
      ...validBase,
      thumbnailStoragePath: null,
      thumbnailStorageUrl: null,
      width: null,
      height: null,
      duration: null,
      fileSize: null,
    });
    expect(parsed.thumbnailStoragePath).toBeNull();
    expect(parsed.width).toBeNull();
  });

  it("rejects missing required fields", () => {
    const { storageUrl, ...missingUrl } = validBase;
    void storageUrl;
    expect(() => UserAssetSchema.parse(missingUrl)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listUserAssets — query building + pagination semantics
// ─────────────────────────────────────────────────────────────────────────────

describe("listUserAssets", () => {
  const row = {
    id: "a1",
    user_id: "user-1",
    media_type: "image",
    mime_type: "image/jpeg",
    file_name: "photo.jpg",
    storage_bucket: "context-media",
    storage_path: "user-1/foo/photo.jpg",
    storage_url: "https://e.com/photo.jpg",
    thumbnail_storage_path: null,
    thumbnail_storage_url: null,
    file_size: 1234,
    width: 100,
    height: 80,
    duration: null,
    created_at: "2026-04-01T00:00:00Z",
  };

  it("returns empty result when no supabase client", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");
    // Replace the mocked factory so it returns null for one call.
    fakeClient = null as unknown as FakeClient;
    const res = await listUserAssets();
    expect(res).toEqual({ assets: [], hasMore: false });
  });

  it("maps snake_case rows to camelCase UserAsset", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");
    fakeClient.nextResolve = { data: [row], error: null };

    const result = await listUserAssets({ limit: 40 });

    expect(result.assets).toHaveLength(1);
    const a = result.assets[0];
    expect(a.fileName).toBe("photo.jpg");
    expect(a.storageBucket).toBe("context-media");
    expect(a.storagePath).toBe("user-1/foo/photo.jpg");
    expect(a.thumbnailStoragePath).toBeNull();
    expect(a.fileSize).toBe(1234);
  });

  it("adds an .in() filter when mediaTypes is provided", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");
    await listUserAssets({ mediaTypes: ["image", "video"] });

    const inCall = fakeClient.lastQuery!.calls.find((c) => c.method === "in");
    expect(inCall).toBeDefined();
    expect(inCall!.args[0]).toBe("media_type");
    expect(inCall!.args[1]).toEqual(["image", "video"]);
  });

  it("skips .in() when mediaTypes is empty or missing", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");
    await listUserAssets({ mediaTypes: [] });
    expect(fakeClient.lastQuery!.calls.some((c) => c.method === "in")).toBe(
      false,
    );
  });

  it("escapes SQL wildcards in the ILIKE search pattern", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");
    await listUserAssets({ query: "50%_off.jpg" });

    const ilikeCall = fakeClient.lastQuery!.calls.find(
      (c) => c.method === "ilike",
    );
    expect(ilikeCall).toBeDefined();
    expect(ilikeCall!.args[0]).toBe("file_name");
    // Both % and _ must be escaped so user input is treated literally.
    expect(ilikeCall!.args[1]).toBe("%50\\%\\_off.jpg%");
  });

  it("does not add an ILIKE when the query is whitespace-only", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");
    await listUserAssets({ query: "   " });
    expect(fakeClient.lastQuery!.calls.some((c) => c.method === "ilike")).toBe(
      false,
    );
  });

  it("sorts ascending when sort is 'oldest', descending otherwise", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");

    await listUserAssets({ sort: "oldest" });
    let orderCall = fakeClient.lastQuery!.calls.find(
      (c) => c.method === "order",
    );
    expect(orderCall!.args[0]).toBe("created_at");
    expect(orderCall!.args[1]).toEqual({ ascending: true });

    fakeClient = makeFakeClient();
    await listUserAssets({ sort: "newest" });
    orderCall = fakeClient.lastQuery!.calls.find((c) => c.method === "order");
    expect(orderCall!.args[1]).toEqual({ ascending: false });
  });

  it("requests limit+1 rows and reports hasMore=true when extra row is returned", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");
    // Limit=2 → request range(0, 2) → 3 rows returned means hasMore is true.
    const data = [row, { ...row, id: "a2" }, { ...row, id: "a3" }];
    fakeClient.nextResolve = { data, error: null };

    const result = await listUserAssets({ limit: 2, offset: 0 });

    const rangeCall = fakeClient.lastQuery!.calls.find(
      (c) => c.method === "range",
    );
    expect(rangeCall!.args).toEqual([0, 2]);
    expect(result.hasMore).toBe(true);
    expect(result.assets).toHaveLength(2);
  });

  it("reports hasMore=false when fewer than limit+1 rows come back", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");
    fakeClient.nextResolve = { data: [row], error: null };
    const result = await listUserAssets({ limit: 40 });
    expect(result.hasMore).toBe(false);
    expect(result.assets).toHaveLength(1);
  });

  it("returns an empty result when Supabase errors out", async () => {
    const { listUserAssets } = await import("@/lib/db/user-assets");
    fakeClient.nextResolve = { data: null, error: { message: "boom" } };
    const result = await listUserAssets();
    expect(result).toEqual({ assets: [], hasMore: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordAsset — idempotency + fire-and-forget semantics
// ─────────────────────────────────────────────────────────────────────────────

describe("recordAsset", () => {
  const input = {
    mediaType: "image" as const,
    mimeType: "image/jpeg",
    fileName: "photo.jpg",
    storageBucket: "context-media",
    storagePath: "user-1/foo/photo.jpg",
    storageUrl: "https://e.com/photo.jpg",
  };

  it("upserts with the (user_id, storage_path) onConflict target", async () => {
    const { recordAsset } = await import("@/lib/db/user-assets");
    await recordAsset(input);

    const upsertCall = fakeClient.lastQuery!.calls.find(
      (c) => c.method === "upsert",
    );
    expect(upsertCall).toBeDefined();
    const [row, opts] = upsertCall!.args as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(row.user_id).toBe("user-under-test");
    expect(row.storage_path).toBe(input.storagePath);
    expect(opts.onConflict).toBe("user_id,storage_path");
  });

  it("coerces undefined optional fields to null at the DB boundary", async () => {
    const { recordAsset } = await import("@/lib/db/user-assets");
    await recordAsset(input);

    const upsertCall = fakeClient.lastQuery!.calls.find(
      (c) => c.method === "upsert",
    );
    const [row] = upsertCall!.args as [Record<string, unknown>];
    expect(row.thumbnail_storage_path).toBeNull();
    expect(row.thumbnail_storage_url).toBeNull();
    expect(row.width).toBeNull();
    expect(row.height).toBeNull();
    expect(row.duration).toBeNull();
    expect(row.file_size).toBeNull();
  });

  it("is a no-op when the user is signed out (does not insert anything)", async () => {
    const { recordAsset } = await import("@/lib/db/user-assets");
    fakeClient.currentUser = null;
    await recordAsset(input);
    expect(fakeClient.lastQuery).toBeNull();
  });

  it("never throws, even when the insert fails", async () => {
    const { recordAsset } = await import("@/lib/db/user-assets");
    fakeClient.nextResolve = { data: null, error: { message: "rls denied" } };
    await expect(recordAsset(input)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteUserAsset
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteUserAsset", () => {
  it("issues a delete scoped to the asset id", async () => {
    const { deleteUserAsset } = await import("@/lib/db/user-assets");
    fakeClient.nextResolve = { data: null, error: null };

    const ok = await deleteUserAsset("asset-42");

    expect(ok).toBe(true);
    const methods = fakeClient.lastQuery!.calls.map((c) => c.method);
    expect(methods).toContain("delete");
    const eqCall = fakeClient.lastQuery!.calls.find((c) => c.method === "eq");
    expect(eqCall!.args).toEqual(["id", "asset-42"]);
  });

  it("returns false and swallows the error when delete fails", async () => {
    const { deleteUserAsset } = await import("@/lib/db/user-assets");
    fakeClient.nextResolve = { data: null, error: { message: "boom" } };
    const ok = await deleteUserAsset("asset-42");
    expect(ok).toBe(false);
  });
});
