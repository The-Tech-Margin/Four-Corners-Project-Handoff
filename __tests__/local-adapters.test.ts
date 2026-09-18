import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonStore } from "@/lib/adapters/local/json-store";
import { createLocalProjectRepository } from "@/lib/adapters/local/projects";
import { createLocalAssetRepository } from "@/lib/adapters/local/assets";
import { createLocalBlobStorage } from "@/lib/adapters/local/blob-storage";
import { createLocalAuth } from "@/lib/adapters/local/auth";
import { createLocalEmail } from "@/lib/adapters/local/email";
import { createLocalRateLimitStore } from "@/lib/adapters/local/rate-limit";
import { ConflictError, ForbiddenError } from "@/lib/ports/errors";
import type { EmailMessage } from "@/lib/ports/email";
import type { ProjectDocument } from "@/lib/projects/types";
import { createEmptyMetadata } from "@/lib/schema";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fc-local-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function project(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: "p1",
    ownerId: "u1",
    slug: "one",
    title: "One",
    metadata: createEmptyMetadata(),
    mainImage: null,
    published: false,
    inGallery: false,
    tags: [],
    lineage: { parentProjectId: null, versionNumber: 1, forkedFromUserId: null, isFork: false },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("JsonStore", () => {
  it("persists rows and reads them back through a new instance", async () => {
    const store = new JsonStore<{ id: string }>(dataDir, "widgets");
    await store.mutate((rows) => ({ rows: [...rows, { id: "a" }], result: undefined }));
    expect(new JsonStore<{ id: string }>(dataDir, "widgets").read()).toEqual([{ id: "a" }]);
  });

  it("notices a file changed underneath it", async () => {
    const store = new JsonStore<{ id: string }>(dataDir, "widgets");
    await store.mutate((rows) => ({ rows: [...rows, { id: "a" }], result: undefined }));
    expect(store.read()).toHaveLength(1);

    writeFileSync(
      join(dataDir, "db", "widgets.json"),
      JSON.stringify({ version: 1, rows: [{ id: "a" }, { id: "b" }] }),
    );
    expect(store.read()).toHaveLength(2);
  });

  it("does not lose concurrent updates", async () => {
    const store = new JsonStore<{ id: number }>(dataDir, "counter");
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        store.mutate((rows) => ({ rows: [...rows, { id: i }], result: undefined })),
      ),
    );
    expect(store.read()).toHaveLength(12);
  });

  it("quarantines a corrupt file rather than overwriting it", () => {
    const store = new JsonStore(dataDir, "broken"); // creates the db directory
    writeFileSync(join(dataDir, "db", "broken.json"), "{ not json");
    expect(() => store.read()).toThrow(/not valid JSON/);
  });
});

describe("local project repository", () => {
  it("refuses a slug another project already uses", async () => {
    const repo = createLocalProjectRepository(dataDir);
    await repo.insert(project());
    await expect(repo.insert(project({ id: "p2" }))).rejects.toBeInstanceOf(ConflictError);
  });

  it("lists an owner's projects newest first", async () => {
    const repo = createLocalProjectRepository(dataDir);
    await repo.insert(project({ id: "old", slug: "old", createdAt: "2026-01-01T00:00:00.000Z" }));
    await repo.insert(project({ id: "new", slug: "new", createdAt: "2026-03-01T00:00:00.000Z" }));
    await repo.insert(project({ id: "theirs", slug: "theirs", ownerId: "u2" }));

    const mine = await repo.listByOwner("u1", { limit: 10, offset: 0 });
    expect(mine.map((doc) => doc.id)).toEqual(["new", "old"]);
  });

  it("only lists published gallery projects, and can filter by tag", async () => {
    const repo = createLocalProjectRepository(dataDir);
    await repo.insert(project({ id: "draft", slug: "draft" }));
    await repo.insert(
      project({ id: "shared", slug: "shared", published: true, inGallery: false }),
    );
    await repo.insert(
      project({
        id: "listed",
        slug: "listed",
        published: true,
        inGallery: true,
        tags: ["climate"],
      }),
    );

    const gallery = await repo.listGallery({ limit: 10, offset: 0, sort: "newest" });
    expect(gallery.map((doc) => doc.id)).toEqual(["listed"]);
    expect(
      (await repo.listGallery({ limit: 10, offset: 0, sort: "newest", tag: "other" })).length,
    ).toBe(0);
  });

  it("counts an owner's other gallery projects", async () => {
    const repo = createLocalProjectRepository(dataDir);
    await repo.insert(project({ id: "a", slug: "a", published: true, inGallery: true }));
    await repo.insert(project({ id: "b", slug: "b", published: true, inGallery: true }));
    expect(await repo.countOwnerGalleryProjects("u1")).toBe(2);
    expect(await repo.countOwnerGalleryProjects("u1", "a")).toBe(1);
  });

  it("refuses updates and deletes from another account", async () => {
    const repo = createLocalProjectRepository(dataDir);
    await repo.insert(project());
    await expect(repo.update("p1", "intruder", (doc) => doc)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(repo.delete("p1", "intruder")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await repo.delete("p1", "u1")).toBe(true);
  });

  it("finds a transcript by its audio key, for its owner only", async () => {
    const repo = createLocalProjectRepository(dataDir);
    const metadata = createEmptyMetadata();
    metadata.voiceTranscriptions = [
      {
        id: "v1",
        recordingId: "r1",
        text: "spoken words",
        transcribedAt: "2026-01-01T00:00:00.000Z",
        audioStoragePath: "u1/voice-recordings/p1/r1.webm",
      },
    ];
    await repo.insert(project({ metadata }));

    expect(await repo.findTranscriptionTextByAudioKey("u1", "u1/voice-recordings/p1/r1.webm")).toBe(
      "spoken words",
    );
    expect(
      await repo.findTranscriptionTextByAudioKey("u2", "u1/voice-recordings/p1/r1.webm"),
    ).toBeNull();
  });
});

describe("local asset repository", () => {
  const asset = {
    mediaType: "image" as const,
    mimeType: "image/jpeg",
    fileName: "photo.jpg",
    bucket: "context-media" as const,
    key: "u1/context-images/p1/photo.jpg",
    thumbnailKey: null,
    fileSize: 1000,
    width: null,
    height: null,
    duration: null,
  };

  it("records one row per key and sums usage", async () => {
    const repo = createLocalAssetRepository(dataDir);
    await repo.record("u1", asset);
    await repo.record("u1", { ...asset, fileSize: 2000 });
    await repo.record("u1", { ...asset, key: "u1/context-images/p1/other.jpg", fileSize: 500 });

    expect(await repo.totalBytes("u1")).toBe(2500);
    expect(await repo.totalBytes("u2")).toBe(0);
  });

  it("filters by media type and search term", async () => {
    const repo = createLocalAssetRepository(dataDir);
    await repo.record("u1", asset);
    await repo.record("u1", {
      ...asset,
      key: "u1/voice-recordings/p1/r.webm",
      fileName: "note.webm",
      mediaType: "audio",
    });

    expect((await repo.list("u1", { mediaTypes: ["audio"] })).assets).toHaveLength(1);
    expect((await repo.list("u1", { query: "photo" })).assets).toHaveLength(1);
  });

  it("deletes only the owner's asset", async () => {
    const repo = createLocalAssetRepository(dataDir);
    const stored = await repo.record("u1", asset);
    expect(await repo.delete("u2", stored.id)).toBeNull();
    expect(await repo.delete("u1", stored.id)).not.toBeNull();
    expect(await repo.totalBytes("u1")).toBe(0);
  });
});

describe("local blob storage", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  it("round-trips an object with its content type", async () => {
    const blobs = createLocalBlobStorage(dataDir);
    await blobs.put("context-media", "u1/context-images/p1/a.jpg", bytes, {
      contentType: "image/jpeg",
    });

    const object = await blobs.get("context-media", "u1/context-images/p1/a.jpg");
    expect(object?.contentType).toBe("image/jpeg");
    expect(object?.totalSize).toBe(8);
  });

  it("serves a byte range", async () => {
    const blobs = createLocalBlobStorage(dataDir);
    await blobs.put("context-media", "u1/context-images/p1/a.jpg", bytes, {
      contentType: "image/jpeg",
    });

    const object = await blobs.get("context-media", "u1/context-images/p1/a.jpg", {
      start: 2,
      end: 4,
    });
    expect(object?.size).toBe(3);
    expect(object?.totalSize).toBe(8);
  });

  it("reports a missing object as null", async () => {
    const blobs = createLocalBlobStorage(dataDir);
    expect(await blobs.get("context-media", "u1/context-images/p1/missing.jpg")).toBeNull();
    expect(await blobs.head("context-media", "u1/context-images/p1/missing.jpg")).toBeNull();
  });

  it("copies, deletes and totals usage per owner", async () => {
    const blobs = createLocalBlobStorage(dataDir);
    await blobs.put("context-media", "u1/context-images/p1/a.jpg", bytes, {
      contentType: "image/jpeg",
    });
    await blobs.copy("context-media", "u1/context-images/p1/a.jpg", "u2/context-images/p9/a.jpg");

    expect((await blobs.head("context-media", "u2/context-images/p9/a.jpg"))?.contentType).toBe(
      "image/jpeg",
    );
    expect((await blobs.usageForOwner("u1")).bytes).toBe(8);

    await blobs.delete("context-media", ["u1/context-images/p1/a.jpg"]);
    expect((await blobs.usageForOwner("u1")).objects).toBe(0);
  });

  it("refuses a traversal key", async () => {
    const blobs = createLocalBlobStorage(dataDir);
    await expect(
      blobs.put("context-media", "../escape.jpg", bytes, { contentType: "image/jpeg" }),
    ).rejects.toThrow(/Invalid storage key/);
  });
});

describe("local auth", () => {
  function auth(sent: EmailMessage[] = []) {
    const email = createLocalEmail();
    return createLocalAuth({
      dataDir,
      sessionSecret: "test-secret",
      signupsEnabled: true,
      secureCookies: false,
      email: {
        capabilities: { delivery: false },
        async send(message) {
          sent.push(message);
          return email.send(message);
        },
      },
    });
  }

  const cookieReader = (cookies: { name: string; value: string }[]) => ({
    get: (name: string) => cookies.find((cookie) => cookie.name === name)?.value,
  });

  it("signs a new account in and recognises its session", async () => {
    const port = auth();
    const result = await port.signUp({ email: "Person@Example.org ", password: "hunter-2-2-2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.user.email).toBe("person@example.org");
    const session = await port.getSessionUser(cookieReader(result.cookies));
    expect(session?.id).toBe(result.user.id);
  });

  it("rejects a duplicate address and a weak password", async () => {
    const port = auth();
    await port.signUp({ email: "a@example.org", password: "hunter-2-2-2" });

    expect(await port.signUp({ email: "a@example.org", password: "hunter-2-2-2" })).toMatchObject({
      ok: false,
      code: "EMAIL_TAKEN",
    });
    expect(await port.signUp({ email: "b@example.org", password: "short" })).toMatchObject({
      ok: false,
      code: "WEAK_PASSWORD",
    });
  });

  it("rejects a wrong password without revealing whether the account exists", async () => {
    const port = auth();
    await port.signUp({ email: "a@example.org", password: "hunter-2-2-2" });

    const wrongPassword = await port.signIn({ email: "a@example.org", password: "nope-nope-1" });
    const noAccount = await port.signIn({ email: "ghost@example.org", password: "nope-nope-1" });
    expect(wrongPassword).toMatchObject({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(noAccount).toMatchObject({ ok: false, code: "INVALID_CREDENTIALS" });
  });

  it("resets a password once per token and signs older sessions out", async () => {
    const sent: EmailMessage[] = [];
    const port = auth(sent);
    const signUp = await port.signUp({ email: "a@example.org", password: "hunter-2-2-2" });
    if (!signUp.ok) throw new Error("sign up failed");

    await port.requestPasswordReset("a@example.org", {
      resetUrl: (token) => `https://example.test/reset?token=${token}`,
    });
    const token = sent.at(-1)?.text?.match(/token=([\w-]+)/)?.[1];
    expect(token).toBeTruthy();

    const reset = await port.consumePasswordReset({
      token: token as string,
      password: "brand-new-password",
    });
    expect(reset.ok).toBe(true);

    // The cookie issued before the reset no longer resolves to a session.
    expect(await port.getSessionUser(cookieReader(signUp.cookies))).toBeNull();
    expect(
      await port.consumePasswordReset({ token: token as string, password: "another-one-here" }),
    ).toMatchObject({ ok: false, code: "INVALID_TOKEN" });
    expect(
      await port.signIn({ email: "a@example.org", password: "brand-new-password" }),
    ).toMatchObject({ ok: true });
  });

  it("says nothing when a reset is requested for an unknown address", async () => {
    const sent: EmailMessage[] = [];
    const port = auth(sent);
    await port.requestPasswordReset("nobody@example.org", { resetUrl: () => "https://x.test" });
    expect(sent).toHaveLength(0);
  });
});

describe("local rate limit", () => {
  it("allows up to the limit, then refuses within the window", async () => {
    const store = createLocalRateLimitStore();
    const rule = { limit: 2, windowSeconds: 60 };

    expect((await store.hit("k", rule)).allowed).toBe(true);
    expect((await store.hit("k", rule)).allowed).toBe(true);

    const third = await store.hit("k", rule);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(Date.parse(third.resetAt)).toBeGreaterThan(Date.now());
  });

  it("counts each key separately", async () => {
    const store = createLocalRateLimitStore();
    const rule = { limit: 1, windowSeconds: 60 };
    await store.hit("a", rule);
    expect((await store.hit("b", rule)).allowed).toBe(true);
  });
});
