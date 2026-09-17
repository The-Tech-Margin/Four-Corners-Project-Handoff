/**
 * POST /api/ai/transcribe — turn a recording into text.
 *
 * Two ways in: the audio inline as multipart form data, or the key of a
 * scratch upload the caller made earlier. Either way the request must carry
 * a session, and a key is only accepted inside the caller's own
 * temp-transcribe prefix — this route deletes what it reads.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import { CapabilityUnavailableError } from "@/lib/ports/errors";
import { isTempTranscribeKey } from "@/lib/storage/keys";
import {
  assertSameOrigin,
  errorResponse,
  handleRouteError,
  json,
  unauthorized,
} from "@/lib/server/http";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INLINE_LIMIT_BYTES = 10 * 1024 * 1024;

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { ai, blobs } = getServices();
    if (!ai.capabilities.transcription) {
      return errorResponse("Transcription is not configured", 501, "CAPABILITY_UNAVAILABLE");
    }

    const contentType = request.headers.get("content-type") ?? "";
    let bytes: Uint8Array;
    let mimeType = "audio/webm";
    let fileName: string | undefined;
    let scratchKey: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return errorResponse("No audio in the request", 400);
      if (file.size > INLINE_LIMIT_BYTES) {
        return errorResponse("Upload the recording first, then send its key", 413);
      }
      bytes = new Uint8Array(await file.arrayBuffer());
      mimeType = file.type || mimeType;
      fileName = file.name;
    } else {
      const body = (await request.json()) as { key?: string; mimeType?: string };
      const key = body.key ?? "";
      // Only the caller's own scratch uploads: this route deletes what it reads.
      if (!isTempTranscribeKey(key, user.id)) return errorResponse("Unknown recording", 400);

      const object = await blobs.get("voice-recordings", key);
      if (!object) return errorResponse("Recording not found", 404);

      bytes = await readStream(object.stream);
      mimeType = body.mimeType || object.contentType || mimeType;
      scratchKey = key;
    }

    try {
      const result = await ai.transcribe({ bytes, mimeType, fileName });
      return json({ text: result.text, kind: result.kind });
    } finally {
      if (scratchKey) {
        await blobs.delete("voice-recordings", [scratchKey]).catch(() => undefined);
      }
    }
  } catch (error) {
    if (error instanceof CapabilityUnavailableError) {
      return errorResponse(error.message, 501, error.code);
    }
    return handleRouteError(error, "Transcription failed");
  }
}
