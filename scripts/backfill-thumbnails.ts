/**
 * Backfill script: generate gallery thumbnails for projects whose main image
 * was uploaded before migration 041 (no main_image_thumbnail_path).
 *
 * NON-DESTRUCTIVE:
 *   - Only touches rows with main_image_storage_path NOT NULL AND
 *     main_image_thumbnail_path NULL
 *   - Only WRITES main_image_thumbnail_path; never alters the original
 *   - Idempotent — re-running skips already-thumbnailed rows
 *   - Aspect ratio is preserved (sharp fit:"inside", no upscaling)
 *
 * Usage:
 *   npx tsx scripts/backfill-thumbnails.ts [--dry-run] [--limit N]
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   (sb_secret_… — bypasses RLS)
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

// Load .env.local manually (no dotenv dependency)
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^(\w+)="?([^"]*)"?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* fall through to env vars from shell */ }

const BUCKET = "context-media";
const BATCH_SIZE = 5;
const THUMB_MAX = 400;
const THUMB_QUALITY = 80;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

interface ProjectRow {
  id: string;
  main_image_storage_path: string;
}

async function processOne(row: ProjectRow): Promise<{ ok: boolean; reason?: string }> {
  const sourcePath = row.main_image_storage_path;
  const thumbPath = `${sourcePath.replace(/\.[^.]+$/, "")}.thumb.jpg`;

  // 1. Download original
  const { data: originalBlob, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(sourcePath);

  if (dlError || !originalBlob) {
    return { ok: false, reason: `download failed: ${dlError?.message ?? "no data"}` };
  }

  // 2. Resize via sharp (aspect-preserving, never upscales)
  let thumbBuffer: Buffer;
  try {
    const arrayBuffer = await originalBlob.arrayBuffer();
    thumbBuffer = await sharp(Buffer.from(arrayBuffer))
      .rotate() // honor EXIF orientation so the thumb matches the displayed image
      .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY, progressive: true, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    return { ok: false, reason: `sharp resize failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (dryRun) {
    return { ok: true, reason: `[dry-run] would upload ${thumbPath} (${thumbBuffer.byteLength} bytes)` };
  }

  // 3. Upload thumb
  const { error: upError } = await supabase.storage
    .from(BUCKET)
    .upload(thumbPath, thumbBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (upError) {
    return { ok: false, reason: `upload failed: ${upError.message}` };
  }

  // 4. Persist path on the project row
  const { error: dbError } = await supabase
    .from("projects")
    .update({ main_image_thumbnail_path: thumbPath })
    .eq("id", row.id);

  if (dbError) {
    return { ok: false, reason: `db update failed: ${dbError.message}` };
  }

  return { ok: true };
}

async function main() {
  console.log(`Backfill thumbnails — ${dryRun ? "DRY RUN" : "LIVE"} (limit: ${limit === Infinity ? "all" : limit})`);

  const { data: rows, error } = await supabase
    .from("projects")
    .select("id, main_image_storage_path")
    .not("main_image_storage_path", "is", null)
    .is("main_image_thumbnail_path", null)
    .limit(limit === Infinity ? 10000 : limit);

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const candidates = (rows ?? []).filter(
    (r): r is ProjectRow => typeof r.main_image_storage_path === "string",
  );

  console.log(`Found ${candidates.length} project(s) needing thumbnails.`);

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (row) => {
        const result = await processOne(row);
        if (result.ok) {
          console.log(`✓ ${row.id} ${result.reason ?? ""}`);
        } else {
          console.error(`✗ ${row.id} (${row.main_image_storage_path}): ${result.reason}`);
        }
        return result;
      }),
    );
    ok += results.filter((r) => r.ok).length;
    failed += results.filter((r) => !r.ok).length;
  }

  console.log(`\nDone. ${ok} ok, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
