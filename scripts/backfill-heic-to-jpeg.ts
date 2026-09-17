/**
 * Backfill script: convert HEIC files in storage to JPEG and relink DB rows.
 *
 * WHY:
 *   Chrome/Firefox/Edge cannot render HEIC natively. iPhone uploads end up as
 *   unrenderable main images, and context-item thumbnail generation throws
 *   (Image decode fails) which causes the client uploader to leave
 *   storage_path/storage_url NULL on the row — the full-size HEIC is actually
 *   in the bucket, just orphaned.
 *
 * WHAT IT DOES:
 *   1. Projects with main_image_storage_path ending in .heic/.heif:
 *      - Download HEIC, convert to JPEG, upload alongside as `.jpg`
 *      - Update main_image_storage_path → new `.jpg` path
 *   2. context_items whose filename ends in .heic/.heif AND storage_path IS NULL:
 *      - Look for the orphaned HEIC at {user_id}/context-images/{project_id}/{sanitized}
 *      - If found: convert to JPEG, upload `.jpg`, generate `thumbs/<name>.jpg`,
 *        update storage_path / storage_url / thumbnail_storage_path /
 *        thumbnail_storage_url / mime_type on the row
 *      - If not found in bucket: skip (no source to convert from)
 *   3. Originals are NEVER deleted — .heic files stay in the bucket.
 *
 * NON-DESTRUCTIVE & IDEMPOTENT:
 *   - Never deletes any storage object or DB row
 *   - Safe to re-run: main-image query filters to HEIC paths only; context
 *     query filters to storage_path IS NULL — already-processed rows are skipped
 *   - `--dry-run` prints planned actions without writing
 *   - `--project-id <uuid>` limits to a single project
 *
 * Usage:
 *   npx tsx scripts/backfill-heic-to-jpeg.ts [--dry-run] [--project-id UUID] [--limit N]
 *
 * Requires (read from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   (sb_secret_… — bypasses RLS)
 *
 * Requires: npm install --save-dev heic-convert sharp @types/heic-convert
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import convert from "heic-convert";
import sharp from "sharp";

// Load .env.local manually (no dotenv dependency)
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^(\w+)="?([^"]*)"?$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const BUCKET = "context-media";
const THUMB_MAX = 400; // px, matches generateThumbnailBlob client default
const JPEG_QUALITY = 0.9;
const THUMB_QUALITY = 0.8;

// ── CLI args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const projectIdx = args.indexOf("--project-id");
const targetProjectId = projectIdx !== -1 ? args[projectIdx + 1] : null;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Supabase client ───────────────────────────────────────────────────────

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

// ── Helpers ───────────────────────────────────────────────────────────────

function isHeicPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return /\.heic$|\.heif$/i.test(path);
}

function toJpegPath(heicPath: string): string {
  return heicPath.replace(/\.(heic|heif)$/i, ".jpg");
}

/** Matches the client-side sanitizer in uploadContextImageToSupabase. */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Download an object from the bucket. Returns null if not found. */
async function downloadFromBucket(path: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Check whether an object exists in the bucket by listing its parent folder. */
async function bucketObjectExists(path: string): Promise<boolean> {
  const lastSlash = path.lastIndexOf("/");
  const folder = path.substring(0, lastSlash);
  const name = path.substring(lastSlash + 1);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(folder, { search: name, limit: 100 });
  if (error || !data) return false;
  return data.some((f) => f.name === name);
}

/** Convert HEIC buffer → JPEG buffer. */
async function heicToJpeg(heic: Buffer): Promise<Buffer> {
  const out = await convert({
    buffer: heic as unknown as ArrayBufferLike,
    format: "JPEG",
    quality: JPEG_QUALITY,
  });
  return Buffer.from(out as ArrayBuffer);
}

/** Resize a JPEG buffer down to a thumbnail (longest side = THUMB_MAX). */
async function makeThumb(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg)
    .rotate() // respect EXIF orientation
    .resize({
      width: THUMB_MAX,
      height: THUMB_MAX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: Math.round(THUMB_QUALITY * 100) })
    .toBuffer();
}

/** Upload a buffer to the bucket (idempotent via upsert). */
async function uploadToBucket(
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
}

function publicUrlFor(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ── Main image backfill ───────────────────────────────────────────────────

type ProjectRow = {
  id: string;
  user_id: string;
  slug: string | null;
  main_image_storage_path: string | null;
};

async function fetchProjectsWithHeicMain(): Promise<ProjectRow[]> {
  let query = supabase
    .from("projects")
    .select("id, user_id, slug, main_image_storage_path");

  if (targetProjectId) {
    query = query.eq("id", targetProjectId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).filter((p) => isHeicPath(p.main_image_storage_path));
}

async function processMainImage(project: ProjectRow): Promise<"ok" | "skip" | "fail"> {
  const label = `[main ${project.slug || project.id.substring(0, 8)}]`;
  const heicPath = project.main_image_storage_path!;
  const jpegPath = toJpegPath(heicPath);

  if (dryRun) {
    console.log(`${label} WOULD convert ${heicPath} → ${jpegPath}`);
    return "ok";
  }

  const heic = await downloadFromBucket(heicPath);
  if (!heic) {
    console.warn(`${label} SKIP — HEIC not found in bucket: ${heicPath}`);
    return "skip";
  }

  const jpeg = await heicToJpeg(heic);
  await uploadToBucket(jpegPath, jpeg, "image/jpeg");

  const { error } = await supabase
    .from("projects")
    .update({ main_image_storage_path: jpegPath })
    .eq("id", project.id);
  if (error) throw error;

  console.log(`${label} OK — ${heicPath} → ${jpegPath} (${(jpeg.length / 1024).toFixed(0)} KB)`);
  return "ok";
}

// ── Context item backfill ─────────────────────────────────────────────────

type ContextRow = {
  id: string;
  project_id: string;
  filename: string | null;
  storage_path: string | null;
  storage_url: string | null;
  thumbnail_storage_path: string | null;
  thumbnail_storage_url: string | null;
  mime_type: string | null;
  media_type: string | null;
};

type ProjectLookup = { id: string; user_id: string; slug: string | null };

async function fetchOrphanedHeicContext(): Promise<{
  items: ContextRow[];
  projects: Map<string, ProjectLookup>;
}> {
  // Candidate items: HEIC filename and no storage_path (the bug's signature).
  let query = supabase
    .from("context_items")
    .select(
      "id, project_id, filename, storage_path, storage_url, thumbnail_storage_path, thumbnail_storage_url, mime_type, media_type",
    )
    .is("storage_path", null)
    .or("filename.ilike.%.heic,filename.ilike.%.heif");

  if (targetProjectId) {
    query = query.eq("project_id", targetProjectId);
  }

  const { data: items, error } = await query;
  if (error) throw error;

  const projectIds = Array.from(new Set((items ?? []).map((i) => i.project_id)));
  const projects = new Map<string, ProjectLookup>();

  if (projectIds.length > 0) {
    const { data: projRows, error: projErr } = await supabase
      .from("projects")
      .select("id, user_id, slug")
      .in("id", projectIds);
    if (projErr) throw projErr;
    for (const p of projRows ?? []) projects.set(p.id, p);
  }

  return { items: (items ?? []) as ContextRow[], projects };
}

async function processContextItem(
  item: ContextRow,
  project: ProjectLookup,
): Promise<"ok" | "skip" | "fail"> {
  const label = `[ctx ${project.slug || project.id.substring(0, 8)}/${item.filename}]`;

  if (!item.filename) {
    console.warn(`${label} SKIP — no filename`);
    return "skip";
  }

  const sanitized = sanitizeFilename(item.filename);
  const heicPath = `${project.user_id}/context-images/${project.id}/${sanitized}`;
  const jpegName = sanitized.replace(/\.(heic|heif)$/i, ".jpg");
  const jpegPath = `${project.user_id}/context-images/${project.id}/${jpegName}`;
  const thumbPath = `${project.user_id}/context-images/${project.id}/thumbs/${jpegName}`;

  // Verify source exists before doing any work
  const exists = await bucketObjectExists(heicPath);
  if (!exists) {
    console.warn(`${label} SKIP — orphan HEIC not in bucket: ${heicPath}`);
    return "skip";
  }

  if (dryRun) {
    console.log(`${label} WOULD convert & relink → ${jpegPath} + thumb`);
    return "ok";
  }

  const heic = await downloadFromBucket(heicPath);
  if (!heic) {
    console.warn(`${label} SKIP — download failed: ${heicPath}`);
    return "skip";
  }

  const jpeg = await heicToJpeg(heic);
  const thumb = await makeThumb(jpeg);

  await uploadToBucket(jpegPath, jpeg, "image/jpeg");
  await uploadToBucket(thumbPath, thumb, "image/jpeg");

  const { error } = await supabase
    .from("context_items")
    .update({
      storage_path: jpegPath,
      storage_url: publicUrlFor(jpegPath),
      thumbnail_storage_path: thumbPath,
      thumbnail_storage_url: publicUrlFor(thumbPath),
      mime_type: "image/jpeg",
      media_type: "image",
    })
    .eq("id", item.id);
  if (error) throw error;

  console.log(
    `${label} OK — ${(jpeg.length / 1024).toFixed(0)} KB + thumb ${(thumb.length / 1024).toFixed(0)} KB`,
  );
  return "ok";
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Backfill HEIC → JPEG ===`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (targetProjectId) console.log(`Project: ${targetProjectId}`);
  console.log(`Limit: ${limit === Infinity ? "none" : limit}\n`);

  // 1. Main images
  console.log("→ Scanning projects with HEIC main images...");
  const mainProjects = (await fetchProjectsWithHeicMain()).slice(0, limit);
  console.log(`  Found ${mainProjects.length}\n`);

  let mainOk = 0,
    mainSkip = 0,
    mainFail = 0;
  for (const p of mainProjects) {
    try {
      const res = await processMainImage(p);
      if (res === "ok") mainOk++;
      else if (res === "skip") mainSkip++;
    } catch (err) {
      console.error(`[main ${p.id}] FAILED:`, (err as Error).message);
      mainFail++;
    }
  }

  // 2. Context items
  console.log(`\n→ Scanning orphaned HEIC context items...`);
  const { items, projects } = await fetchOrphanedHeicContext();
  const capped = items.slice(0, limit);
  console.log(`  Found ${capped.length}\n`);

  let ctxOk = 0,
    ctxSkip = 0,
    ctxFail = 0;
  for (const item of capped) {
    const project = projects.get(item.project_id);
    if (!project) {
      console.warn(`[ctx ${item.id}] SKIP — parent project missing`);
      ctxSkip++;
      continue;
    }
    try {
      const res = await processContextItem(item, project);
      if (res === "ok") ctxOk++;
      else if (res === "skip") ctxSkip++;
    } catch (err) {
      console.error(`[ctx ${item.id}] FAILED:`, (err as Error).message);
      ctxFail++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Main images — ok: ${mainOk}, skip: ${mainSkip}, fail: ${mainFail}`);
  console.log(`Context items — ok: ${ctxOk}, skip: ${ctxSkip}, fail: ${ctxFail}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
