/**
 * GET /api/transcripts?audioKey= — the text already transcribed for one of
 * the caller's recordings, so a re-transcription is never paid for twice.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import { errorResponse, handleRouteError, json, unauthorized } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const audioKey = request.nextUrl.searchParams.get("audioKey");
    if (!audioKey) return errorResponse("audioKey is required", 400);

    const text = await getServices().projects.findTranscriptionTextByAudioKey(user.id, audioKey);
    return json({ text });
  } catch (error) {
    return handleRouteError(error, "Failed to look up the transcript");
  }
}
