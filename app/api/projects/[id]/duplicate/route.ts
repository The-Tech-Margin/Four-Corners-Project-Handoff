import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/db/projects";
import { apiError } from "@/lib/api-error";
import { getContextItems, type ContextItemRecord } from "@/lib/db/context-items";
import { getLinks, type LinkRecord } from "@/lib/db/links";
import { getVoiceTranscriptions, type VoiceTranscriptionRecord } from "@/lib/db/voice-transcriptions";
import { upsertBackstory } from "@/lib/db/backstory";
import { upsertCreativeCommons } from "@/lib/db/creative-commons";
import { upsertPhotographerInfo } from "@/lib/db/photographer-info";
import { upsertEthics } from "@/lib/db/ethics";
import { upsertLocation } from "@/lib/db/locations";
import { upsertPhotoMetadata } from "@/lib/db/photo-metadata";

/**
 * POST /api/projects/:id/duplicate - Duplicate/copy a project
 * Phase 5: Copies all data from normalized tables (no JSONB blob).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    // Await params (Next.js 15+)
    const { id } = await params;

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the original project (includes metadata built from normalized tables)
    const originalProject = await getProject(id);

    // Check if user has access to read this project
    if (!originalProject.published && originalProject.user_id !== user.id) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Get all normalized data from source project
    const [contextItems, links, voiceTranscriptions] = await Promise.all([
      getContextItems(id, supabase),
      getLinks(id, supabase),
      getVoiceTranscriptions(id, supabase),
    ]);

    // Determine if this is a fork (from another user) or a copy (same user)
    const isFork = originalProject.user_id !== user.id;

    // Get the latest version number for this project lineage
    const { data: existingVersions, error: versionError } = await supabase
      .from("projects")
      .select("version_number")
      .eq("parent_project_id", originalProject.parent_project_id || id)
      .eq("user_id", user.id)
      .order("version_number", { ascending: false })
      .limit(1);

    if (versionError) {
      console.error("Error fetching versions:", versionError);
    }

    const nextVersionNumber =
      existingVersions && existingVersions.length > 0
        ? existingVersions[0].version_number + 1
        : 1;

    // Create the duplicate project row
    const { data: newProject, error: createError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        metadata: originalProject.metadata,
        main_image_url: originalProject.main_image_url,
        main_image_storage_path: null, // Don't copy storage path (files are user-specific)
        published: false, // New copies are private by default
        parent_project_id: originalProject.parent_project_id || id,
        version_number: nextVersionNumber,
        forked_from_user_id: isFork ? originalProject.user_id : null,
        is_fork: isFork,
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    const metadata = originalProject.metadata;

    // Copy 1:1 normalized tables in parallel
    await Promise.all([
      upsertBackstory(newProject.id, metadata.backStory, supabase),
      upsertCreativeCommons(newProject.id, metadata.creativeCommons, supabase),
      upsertPhotographerInfo(newProject.id, metadata.photographerInfo, supabase),
      upsertEthics(newProject.id, metadata.ethics, supabase),
      upsertLocation(newProject.id, metadata.location, supabase),
      upsertPhotoMetadata(newProject.id, metadata.photoMetadata, supabase),
    ]);

    // Copy context items
    if (contextItems.length > 0) {
      const contextInserts = contextItems.map((item: ContextItemRecord) => ({
        project_id: newProject.id,
        source_type: item.source_type,
        filename: item.filename,
        mime_type: item.mime_type,
        caption: item.caption,
        media_type: item.media_type,
        url: item.url,
        description: item.description,
        credit: item.credit,
        date: item.date,
        storage_path: null, // Don't copy storage paths (user-specific)
        thumbnail_storage_path: null,
        storage_url: item.storage_url,
        thumbnail_storage_url: item.thumbnail_storage_url,
        audio_storage_path: item.audio_storage_path,
        audio_storage_url: item.audio_storage_url,
        audio_mime_type: item.audio_mime_type,
        audio_duration: item.audio_duration,
        linked_project_id: item.linked_project_id,
        linked_project_slug: item.linked_project_slug,
        position: item.position,
      }));

      const { error: contextError } = await supabase
        .from("context_items")
        .insert(contextInserts);

      if (contextError) {
        console.error("Error copying context items:", contextError);
      }
    }

    // Copy links
    if (links.length > 0) {
      const linkInserts = links.map((link: LinkRecord) => ({
        project_id: newProject.id,
        title: link.title,
        url: link.url,
        source: link.source,
        position: link.position,
      }));

      const { error: linksError } = await supabase
        .from("links")
        .insert(linkInserts);

      if (linksError) {
        console.error("Error copying links:", linksError);
      }
    }

    // Copy voice transcriptions
    if (voiceTranscriptions.length > 0) {
      const vtInserts = voiceTranscriptions.map((vt: VoiceTranscriptionRecord) => ({
        project_id: newProject.id,
        recording_id: vt.recording_id,
        text: vt.text,
        transcribed_at: vt.transcribed_at,
        field_id: vt.field_id,
        audio_storage_path: vt.audio_storage_path,
        audio_storage_url: vt.audio_storage_url,
        mime_type: vt.mime_type,
        duration: vt.duration,
        position: vt.position,
      }));

      const { error: vtError } = await supabase
        .from("voice_transcriptions")
        .insert(vtInserts);

      if (vtError) {
        console.error("Error copying voice transcriptions:", vtError);
      }
    }

    return NextResponse.json(
      {
        project: newProject,
        version: nextVersionNumber,
        isFork,
        message: isFork
          ? "Project forked successfully. You can now edit your copy."
          : "Project duplicated successfully.",
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error, "Failed to duplicate project");
  }
}
