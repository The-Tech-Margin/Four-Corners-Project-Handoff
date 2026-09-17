import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createProject, listUserProjects } from "@/lib/db/projects";
import { apiError } from "@/lib/api-error";
import { DEV_AUTH_COOKIE, DEV_USER, isDevAuthEnabled } from "@/lib/dev-auth";
import { createContextItem } from "@/lib/db/context-items";
import { createLink } from "@/lib/db/links";
import { upsertBackstory } from "@/lib/db/backstory";
import { upsertCreativeCommons } from "@/lib/db/creative-commons";
import { upsertPhotographerInfo } from "@/lib/db/photographer-info";
import { upsertEthics } from "@/lib/db/ethics";
import { upsertLocation } from "@/lib/db/locations";
import { upsertPhotoMetadata } from "@/lib/db/photo-metadata";
import { createVoiceTranscription } from "@/lib/db/voice-transcriptions";
import type { FourCornersMetadataExtended } from "@/lib/schema";

/**
 * GET /api/projects - List user's projects (paginated).
 *
 * Query params:
 *   limit  — items per page (default 24, max 100)
 *   offset — pagination offset (default 0)
 *
 * Cache: private, 30s — browser may reuse the response for back-nav.
 * Auth-gated: requires valid session.
 */
export async function GET(request: NextRequest) {
  try {
    // Dev auth bypass (double-gated)
    if (
      isDevAuthEnabled() &&
      request.cookies.get(DEV_AUTH_COOKIE)?.value === "true"
    ) {
      return NextResponse.json({ projects: [] });
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit")) || 24, 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const projects = await listUserProjects(user.id, supabase, limit, offset);

    return NextResponse.json({ projects }, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return apiError(error, "Failed to fetch projects");
  }
}

/**
 * POST /api/projects - Create new project
 * Dual-writes: blob + all normalized tables
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { metadata, slug } = body as {
      metadata: FourCornersMetadataExtended;
      slug?: string;
    };

    if (!metadata || typeof metadata !== "object") {
      return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
    }

    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        {
          error:
            "Invalid slug format. Use lowercase letters, numbers, and hyphens only",
        },
        { status: 400 }
      );
    }

    if (metadata.context && metadata.context.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 context items allowed" },
        { status: 400 }
      );
    }

    if (metadata.links && metadata.links.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 links allowed" },
        { status: 400 }
      );
    }

    // Create project row (no JSONB blob — normalized tables are the source of truth)
    const project = await createProject(metadata, user.id, slug, undefined, undefined, undefined, false);

    // Upsert all normalized tables
    await Promise.all([
      upsertBackstory(project.id, metadata.backStory, supabase),
      upsertCreativeCommons(project.id, metadata.creativeCommons, supabase),
      upsertPhotographerInfo(project.id, metadata.photographerInfo, supabase),
      upsertEthics(project.id, metadata.ethics, supabase),
      upsertLocation(project.id, metadata.location, supabase),
      upsertPhotoMetadata(project.id, metadata.photoMetadata, supabase),
    ]);

    // Create context items
    if (metadata.context && metadata.context.length > 0) {
      for (let i = 0; i < metadata.context.length; i++) {
        await createContextItem(project.id, metadata.context[i], i, supabase);
      }
    }

    // Create links
    if (metadata.links && metadata.links.length > 0) {
      for (let i = 0; i < metadata.links.length; i++) {
        await createLink(project.id, metadata.links[i], i, supabase);
      }
    }

    // Create voice transcriptions
    if (metadata.voiceTranscriptions && metadata.voiceTranscriptions.length > 0) {
      for (let i = 0; i < metadata.voiceTranscriptions.length; i++) {
        await createVoiceTranscription(project.id, metadata.voiceTranscriptions[i], i, supabase);
      }
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return apiError(error, "Failed to create project");
  }
}
