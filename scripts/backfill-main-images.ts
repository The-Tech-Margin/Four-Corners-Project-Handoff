/**
 * Backfill script: upload base64 main images to Supabase Storage.
 *
 * NON-DESTRUCTIVE:
 *   - Only touches projects where main_image_storage_path IS NULL
 *     and main_image_url starts with "data:"
 *   - Does NOT modify or delete main_image_url (base64 stays intact)
 *   - Only WRITES to main_image_storage_path
 *   - Idempotent: safe to re-run — skips already-backfilled projects
 *
 * Usage:
 *   npx tsx scripts/backfill-main-images.ts [--dry-run] [--limit N]
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

// Load .env.local manually (no dotenv dependency)
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^(\w+)="?([^"]*)"?$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const BUCKET = "context-media";
const BATCH_SIZE = 5; // process 5 at a time to avoid memory pressure

// ── CLI args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Supabase client ───────────────────────────────────────────────────────

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

// ── Helpers ───────────────────────────────────────────────────────────────

function base64ToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string; ext: string } {
  const match = dataUrl.match(/^data:(image\/(\w+));base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL format");

  const mimeType = match[1];
  const ext = match[2] === "jpeg" ? "jpg" : match[2];
  const buffer = Buffer.from(match[3], "base64");

  return { buffer, mimeType, ext };
}

async function uploadMainImage(
  userId: string,
  projectId: string,
  dataUrl: string,
): Promise<string> {
  const { buffer, mimeType, ext } = base64ToBuffer(dataUrl);
  const storagePath = `${userId}/main-images/${projectId}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true, // safe re-run
    });

  if (error) throw error;
  return storagePath;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Backfill main images to storage ===`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Limit: ${limit === Infinity ? "none" : limit}\n`);

  // Find projects that need backfilling:
  // - main_image_url starts with "data:" (is base64)
  // - main_image_storage_path is null (not yet uploaded)
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, user_id, slug, main_image_url")
    .is("main_image_storage_path", null)
    .like("main_image_url", "data:%")
    .limit(Math.min(limit, 100));

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  if (!projects || projects.length === 0) {
    console.log("No projects need backfilling.");
    return;
  }

  console.log(`Found ${projects.length} project(s) to backfill.\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < projects.length; i += BATCH_SIZE) {
    const batch = projects.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (project) => {
        const label = `[${project.slug || project.id.substring(0, 8)}]`;
        const b64Len = project.main_image_url?.length || 0;
        const sizeMB = ((b64Len * 3) / 4 / 1024 / 1024).toFixed(1);

        if (dryRun) {
          console.log(`${label} WOULD upload ~${sizeMB} MB`);
          success++;
          return;
        }

        try {
          const storagePath = await uploadMainImage(
            project.user_id,
            project.id,
            project.main_image_url,
          );

          // Write storage path — does NOT touch main_image_url
          const { error: updateError } = await supabase
            .from("projects")
            .update({ main_image_storage_path: storagePath })
            .eq("id", project.id);

          if (updateError) throw updateError;

          console.log(`${label} OK — ${sizeMB} MB → ${storagePath}`);
          success++;
        } catch (err) {
          console.error(`${label} FAILED:`, (err as Error).message);
          failed++;
        }
      }),
    );
  }

  console.log(`\n=== Done ===`);
  console.log(`Success: ${success}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
