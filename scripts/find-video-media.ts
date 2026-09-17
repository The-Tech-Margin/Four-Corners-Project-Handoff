/**
 * Read-only inspection: locate any trace of a project's uploaded video media.
 *
 * Looks in five places, in order:
 *   1. projects row by slug → resolves project_id + user_id
 *   2. context_items rows for that project (flags video media_type / mime_type)
 *   3. context-media storage objects under {user_id}/context-images/{project_id}/
 *      (and the thumbs/ subfolder)
 *   4. context_items rows across ALL projects owned by this user where
 *      media_type='video' or mime_type LIKE 'video/%' (catches a misfiled upload)
 *   5. context-media storage objects across all of this user's project folders,
 *      filtered to video extensions / mimetypes
 *
 * Cross-references the DB rows against the storage objects to flag orphans
 * either way, then prints one of three verdicts.
 *
 * Strictly read-only: uses only .select() and .list() / .getPublicUrl(). No
 * .upload / .update / .insert / .delete / .remove anywhere in this file.
 *
 * Usage:
 *   npx tsx scripts/find-video-media.ts --slug <project-slug>
 *
 * Requires (read from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   (sb_secret_… — bypasses RLS)
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// Load .env.local manually (no dotenv dependency) — same pattern as backfill-heic-to-jpeg.ts
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^(\w+)="?([^"]*)"?$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const BUCKET = "context-media";
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|mkv|avi|hevc|3gp)$/i;

// ── CLI args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const slugIdx = args.indexOf("--slug");
const slug = slugIdx !== -1 ? args[slugIdx + 1] : null;

if (!slug) {
  console.error("Missing --slug <project-slug>");
  process.exit(1);
}

// ── Supabase client ───────────────────────────────────────────────────────

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

// ── Helpers ───────────────────────────────────────────────────────────────

function looksLikeVideo(name: string | null | undefined, mime?: string | null): boolean {
  if (mime && mime.startsWith("video/")) return true;
  if (name && VIDEO_EXT_RE.test(name)) return true;
  return false;
}

type StorageItem = {
  name: string;
  id?: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
  created_at?: string | null;
  updated_at?: string | null;
};

async function listFolder(path: string): Promise<StorageItem[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(path, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) {
    console.warn(`  ! list("${path}") error: ${error.message}`);
    return [];
  }
  return (data ?? []) as StorageItem[];
}

function publicUrlFor(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function fmtSize(bytes: number | undefined): string {
  if (bytes == null) return "?";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Step 1: resolve project ───────────────────────────────────────────────

type ProjectRow = {
  id: string;
  user_id: string;
  slug: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
};

async function resolveProject(): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id, slug, title, created_at, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("Failed to query projects:", error.message);
    return null;
  }
  return data as ProjectRow | null;
}

// ── Step 2: context_items for the project ─────────────────────────────────

type ContextRow = {
  id: string;
  project_id: string;
  filename: string | null;
  media_type: string | null;
  mime_type: string | null;
  storage_path: string | null;
  storage_url: string | null;
  thumbnail_storage_path: string | null;
  duration: number | null;
  created_at: string;
};

async function fetchContextItemsForProject(projectId: string): Promise<ContextRow[]> {
  const { data, error } = await supabase
    .from("context_items")
    .select(
      "id, project_id, filename, media_type, mime_type, storage_path, storage_url, thumbnail_storage_path, duration, created_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to query context_items:", error.message);
    return [];
  }
  return (data ?? []) as ContextRow[];
}

// ── Step 4: video rows across all of the user's projects ─────────────────

type ContextRowWithSlug = ContextRow & { project_slug: string | null };

async function fetchVideoContextItemsForUser(userId: string): Promise<ContextRowWithSlug[]> {
  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("user_id", userId);
  if (projErr) {
    console.error("Failed to fetch user's projects:", projErr.message);
    return [];
  }
  const slugByProjectId = new Map<string, string | null>();
  for (const p of projects ?? []) slugByProjectId.set(p.id, p.slug);
  const projectIds = Array.from(slugByProjectId.keys());
  if (projectIds.length === 0) return [];

  const { data, error } = await supabase
    .from("context_items")
    .select(
      "id, project_id, filename, media_type, mime_type, storage_path, storage_url, thumbnail_storage_path, duration, created_at",
    )
    .in("project_id", projectIds)
    .or("media_type.eq.video,mime_type.ilike.video/%");
  if (error) {
    console.error("Failed to query user's video context_items:", error.message);
    return [];
  }
  return ((data ?? []) as ContextRow[]).map((r) => ({
    ...r,
    project_slug: slugByProjectId.get(r.project_id) ?? null,
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== find-video-media (read-only) ===`);
  console.log(`Slug: ${slug}\n`);

  // Step 1
  console.log(`→ [1/5] Resolving project by slug...`);
  const project = await resolveProject();
  if (!project) {
    console.log(`  slug not found: ${slug}`);
    console.log(`\n=== VERDICT: slug not found — no project exists with that slug. ===`);
    return;
  }
  console.log(`  project.id   = ${project.id}`);
  console.log(`  project.user = ${project.user_id}`);
  console.log(`  title        = ${project.title ?? "(null)"}`);
  console.log(`  created_at   = ${project.created_at}`);
  console.log(`  updated_at   = ${project.updated_at}`);

  // Step 2
  console.log(`\n→ [2/5] context_items for this project...`);
  const items = await fetchContextItemsForProject(project.id);
  console.log(`  ${items.length} row(s)`);
  const projectVideoRows: ContextRow[] = [];
  for (const item of items) {
    const isVideo = looksLikeVideo(item.filename, item.mime_type) || item.media_type === "video";
    const flag = isVideo ? "VIDEO" : item.media_type ?? "?";
    console.log(
      `    [${flag}] id=${item.id.substring(0, 8)} filename=${item.filename ?? "(null)"} ` +
        `mime=${item.mime_type ?? "(null)"} storage_path=${item.storage_path ?? "(null)"} ` +
        `created=${item.created_at}`,
    );
    if (isVideo) projectVideoRows.push(item);
  }

  // Step 3
  const projectFolder = `${project.user_id}/context-images/${project.id}`;
  console.log(`\n→ [3/5] storage listing under ${projectFolder}/ ...`);
  const projectObjects = await listFolder(projectFolder);
  console.log(`  ${projectObjects.length} object(s) at top level`);
  const projectVideoObjects: { fullPath: string; size?: number; mimetype?: string }[] = [];
  for (const obj of projectObjects) {
    const isVideo = looksLikeVideo(obj.name, obj.metadata?.mimetype);
    const flag = isVideo ? "VIDEO" : "    ";
    console.log(
      `    [${flag}] ${obj.name}  size=${fmtSize(obj.metadata?.size)}  mime=${obj.metadata?.mimetype ?? "?"}  created=${obj.created_at ?? "?"}`,
    );
    if (isVideo) {
      projectVideoObjects.push({
        fullPath: `${projectFolder}/${obj.name}`,
        size: obj.metadata?.size,
        mimetype: obj.metadata?.mimetype,
      });
    }
  }

  const thumbsFolder = `${projectFolder}/thumbs`;
  const thumbsObjects = await listFolder(thumbsFolder);
  if (thumbsObjects.length > 0) {
    console.log(`  ${thumbsObjects.length} object(s) in thumbs/`);
    for (const obj of thumbsObjects) {
      const isVideo = looksLikeVideo(obj.name, obj.metadata?.mimetype);
      const flag = isVideo ? "VIDEO" : "    ";
      console.log(
        `    [${flag}] thumbs/${obj.name}  size=${fmtSize(obj.metadata?.size)}  mime=${obj.metadata?.mimetype ?? "?"}`,
      );
    }
  }

  // Step 4
  console.log(`\n→ [4/5] video context_items across ALL projects owned by ${project.user_id}...`);
  const userVideoRows = await fetchVideoContextItemsForUser(project.user_id);
  console.log(`  ${userVideoRows.length} row(s)`);
  for (const r of userVideoRows) {
    const here = r.project_id === project.id ? " (← THIS PROJECT)" : "";
    console.log(
      `    id=${r.id.substring(0, 8)} project=${r.project_slug ?? r.project_id.substring(0, 8)}${here} ` +
        `filename=${r.filename ?? "(null)"} mime=${r.mime_type ?? "(null)"} ` +
        `storage_path=${r.storage_path ?? "(null)"} created=${r.created_at}`,
    );
  }

  // Step 5
  console.log(`\n→ [5/5] video storage objects across all of this user's project folders...`);
  const userRoot = `${project.user_id}/context-images`;
  const projectFolders = await listFolder(userRoot);
  console.log(`  ${projectFolders.length} project folder(s) under ${userRoot}/`);
  const userVideoObjects: { fullPath: string; size?: number; mimetype?: string }[] = [];
  for (const folder of projectFolders) {
    if (!folder.name) continue;
    const sub = `${userRoot}/${folder.name}`;
    const subObjects = await listFolder(sub);
    for (const obj of subObjects) {
      if (looksLikeVideo(obj.name, obj.metadata?.mimetype)) {
        userVideoObjects.push({
          fullPath: `${sub}/${obj.name}`,
          size: obj.metadata?.size,
          mimetype: obj.metadata?.mimetype,
        });
      }
    }
    // Also peek into thumbs subfolder, though videos are unlikely to live there
    const subThumbs = await listFolder(`${sub}/thumbs`);
    for (const obj of subThumbs) {
      if (looksLikeVideo(obj.name, obj.metadata?.mimetype)) {
        userVideoObjects.push({
          fullPath: `${sub}/thumbs/${obj.name}`,
          size: obj.metadata?.size,
          mimetype: obj.metadata?.mimetype,
        });
      }
    }
  }
  console.log(`  ${userVideoObjects.length} video object(s) across user's folders`);
  for (const o of userVideoObjects) {
    const here = o.fullPath.startsWith(projectFolder) ? " (← THIS PROJECT)" : "";
    console.log(`    ${o.fullPath}${here}  size=${fmtSize(o.size)}  mime=${o.mimetype ?? "?"}`);
  }

  // ── Cross-reference & verdict ──────────────────────────────────────────
  console.log(`\n→ Cross-reference DB rows vs storage objects (this project)`);
  const dbPaths = new Set(projectVideoRows.map((r) => r.storage_path).filter(Boolean) as string[]);
  const objPaths = new Set(projectVideoObjects.map((o) => o.fullPath));

  const rowsWithObject = projectVideoRows.filter(
    (r) => r.storage_path && objPaths.has(r.storage_path),
  );
  const rowsMissingObject = projectVideoRows.filter(
    (r) => !r.storage_path || !objPaths.has(r.storage_path),
  );
  const orphanObjects = projectVideoObjects.filter((o) => !dbPaths.has(o.fullPath));

  console.log(`  ${rowsWithObject.length} row(s) with matching storage object`);
  console.log(`  ${rowsMissingObject.length} row(s) missing storage object`);
  console.log(`  ${orphanObjects.length} storage object(s) with no DB row`);

  console.log(`\n=== VERDICT ===`);
  if (rowsWithObject.length > 0) {
    console.log(`FOUND AND INTACT — DB row + storage object both present.`);
    for (const r of rowsWithObject) {
      const url = r.storage_url || publicUrlFor(r.storage_path!);
      console.log(`  • ${r.filename ?? r.id} → ${url}`);
    }
  } else if (rowsMissingObject.length > 0 || orphanObjects.length > 0) {
    console.log(`PARTIAL LOSS — metadata or bytes exist but not both for this project.`);
    if (rowsMissingObject.length > 0) {
      console.log(`  ${rowsMissingObject.length} row(s) point to storage paths that don't exist:`);
      for (const r of rowsMissingObject) {
        console.log(`    • id=${r.id} filename=${r.filename} storage_path=${r.storage_path ?? "(null)"}`);
      }
    }
    if (orphanObjects.length > 0) {
      console.log(`  ${orphanObjects.length} storage object(s) with no DB row:`);
      for (const o of orphanObjects) {
        console.log(`    • ${o.fullPath} (${fmtSize(o.size)}) → ${publicUrlFor(o.fullPath)}`);
      }
    }
  } else if (userVideoObjects.length > 0 || userVideoRows.length > 0) {
    console.log(`NOT IN THIS PROJECT — but the user has video media elsewhere (see step 4 / 5 above).`);
  } else {
    console.log(`NO TRACE SERVER-SIDE — no video rows, no video storage objects under this user.`);
    console.log(
      `The only remaining hope is the user's browser IndexedDB on the original device:`,
    );
    console.log(
      `  DevTools → Application → IndexedDB → "four-corners-media" → "blobs" store.`,
    );
    console.log(
      `  Look for entries whose .mimeType starts with "video/". The .blob can be saved out.`,
    );
  }
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
