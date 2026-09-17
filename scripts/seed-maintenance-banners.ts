/**
 * Seed script: populate the maintenance_banners library with the shipped
 * preset modes (single source of truth: BANNER_PRESETS in
 * lib/maintenance-banner.ts).
 *
 * NON-DESTRUCTIVE:
 *   - Inserts presets that don't exist yet (matched by slug)
 *   - With --update, refreshes label/config of existing PRESET rows to the
 *     current code definitions; custom rows are never touched
 *   - Idempotent — re-running without --update skips existing slugs
 *
 * Usage:
 *   npx tsx scripts/seed-maintenance-banners.ts [--dry-run] [--update]
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
import { BANNER_PRESETS } from "../lib/maintenance-banner";

// Load .env.local manually (no dotenv dependency)
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^(\w+)="?([^"]*)"?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* fall through to env vars from shell */ }

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const update = args.includes("--update");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: existing, error: readError } = await supabase
    .from("maintenance_banners")
    .select("slug, is_preset");

  if (readError) {
    console.error(
      `Cannot read maintenance_banners (${readError.code}): ${readError.message}`,
    );
    console.error("Has migration 054_maintenance_banners.sql been applied?");
    process.exit(1);
  }

  const existingSlugs = new Set((existing ?? []).map((r) => r.slug));
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const preset of BANNER_PRESETS) {
    const exists = existingSlugs.has(preset.id);

    if (exists && !update) {
      console.log(`skip    ${preset.id} (already present)`);
      skipped++;
      continue;
    }

    const action = exists ? "update" : "insert";
    if (dryRun) {
      console.log(`[dry]   ${action}  ${preset.id} — "${preset.label}"`);
      if (exists) updated++;
      else inserted++;
      continue;
    }

    const { error } = await supabase.from("maintenance_banners").upsert(
      {
        slug: preset.id,
        label: preset.label,
        config: preset.config,
        is_preset: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    );

    if (error) {
      console.error(`FAILED  ${preset.id}: ${error.message}`);
      process.exit(1);
    }
    console.log(`${action}  ${preset.id} — "${preset.label}"`);
    if (exists) updated++;
    else inserted++;
  }

  console.log(
    `\nDone${dryRun ? " (dry run)" : ""}: ${inserted} inserted, ${updated} updated, ${skipped} skipped.`,
  );
}

main();
