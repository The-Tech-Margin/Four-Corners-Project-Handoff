import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProject, updateProject, deleteProject } from "@/lib/db/projects";
import { apiError } from "@/lib/api-error";
import {
  syncContextItems,
} from "@/lib/db/context-items";
import { deleteAllLinks, createLink } from "@/lib/db/links";
import { upsertBackstory } from "@/lib/db/backstory";
import { upsertCreativeCommons } from "@/lib/db/creative-commons";
import { upsertPhotographerInfo } from "@/lib/db/photographer-info";
import { upsertEthics } from "@/lib/db/ethics";
import { upsertLocation } from "@/lib/db/locations";
import { upsertPhotoMetadata } from "@/lib/db/photo-metadata";
import { deleteAllVoiceTranscriptions, createVoiceTranscription } from "@/lib/db/voice-transcriptions";
import { reconstructMetadata } from "@/lib/db/reconstruct-metadata";
import type { FourCornersMetadataExtended } from "@/lib/schema";

/**
 * GET /api/projects/:id - Get project by ID
 * Reads from normalized tables via reconstructMetadata()
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const projectRecord = await getProject(id);

    // Check if user has access (owner or published)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (
      !projectRecord.published &&
      (!user || user.id !== projectRecord.user_id)
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Reconstruct metadata from normalized tables
    const metadata = await reconstructMetadata(id, supabase);

    return NextResponse.json({
      project: projectRecord,
      metadata,
    });
  } catch (error) {
    return apiError(error, "Failed to fetch project");
  }
}

/**
 * PUT /api/projects/:id - Update project
 * Dual-writes: blob + all normalized tables
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { metadata } = body as { metadata: FourCornersMetadataExtended };

    if (!metadata || typeof metadata !== "object") {
      return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
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

    // Update project row (no JSONB blob — normalized tables are the source of truth)
    const project = await updateProject(id, metadata, user.id, undefined, undefined);

    // Upsert all normalized tables
    await Promise.all([
      upsertBackstory(id, metadata.backStory, supabase),
      upsertCreativeCommons(id, metadata.creativeCommons, supabase),
      upsertPhotographerInfo(id, metadata.photographerInfo, supabase),
      upsertEthics(id, metadata.ethics, supabase),
      upsertLocation(id, metadata.location, supabase),
      upsertPhotoMetadata(id, metadata.photoMetadata, supabase),
    ]);

    // Sync context items (upsert pattern preserves CASCADE children)
    await syncContextItems(id, metadata.context || [], supabase);

    // Replace links
    await deleteAllLinks(id, supabase);
    if (metadata.links && metadata.links.length > 0) {
      for (let i = 0; i < metadata.links.length; i++) {
        await createLink(id, metadata.links[i], i, supabase);
      }
    }

    // Replace voice transcriptions
    await deleteAllVoiceTranscriptions(id, supabase);
    if (metadata.voiceTranscriptions && metadata.voiceTranscriptions.length > 0) {
      for (let i = 0; i < metadata.voiceTranscriptions.length; i++) {
        await createVoiceTranscription(id, metadata.voiceTranscriptions[i], i, supabase);
      }
    }

    return NextResponse.json({ project });
  } catch (error) {
    return apiError(error, "Failed to update project");
  }
}

/**
 * DELETE /api/projects/:id - Delete project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await deleteProject(id, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "Failed to delete project");
  }
}
