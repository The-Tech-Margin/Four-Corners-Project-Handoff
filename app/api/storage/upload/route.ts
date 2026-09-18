/**
 * POST /api/storage/upload — receive one file and store it.
 *
 * The browser never talks to the object store: it posts here, the server
 * checks the session and the quota, picks the key, and records the asset.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import type { AssetMediaType } from "@/lib/ports/assets";
import type { BucketName } from "@/lib/ports/blob-storage";
import { blobUrl } from "@/lib/storage/blob-url";
import {
  contextAudioKey,
  contextMediaKey,
  contextThumbnailKey,
  mainImageKey,
  mainThumbnailKey,
  tempTranscribeKey,
  voiceRecordingKey,
} from "@/lib/storage/keys";
import {
  assertSameOrigin,
  errorResponse,
  handleRouteError,
  json,
  unauthorized,
} from "@/lib/server/http";
import { assertQuotaFor } from "@/lib/server/quota";
import { getServerUser } from "@/lib/server/session";
import { extensionFromMime, kindFromMime, validateUpload } from "@/lib/upload-limits";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PURPOSES = [
  "main-image",
  "main-thumbnail",
  "context-media",
  "context-thumbnail",
  "context-audio",
  "voice-recording",
  "transcribe-source",
] as const;

type Purpose = (typeof PURPOSES)[number];

const MEDIA_TYPE: Record<Purpose, AssetMediaType> = {
  "main-image": "image",
  "main-thumbnail": "image",
  "context-media": "image",
  "context-thumbnail": "image",
  "context-audio": "audio",
  "voice-recording": "audio",
  "transcribe-source": "audio",
};

function bucketFor(purpose: Purpose): BucketName {
  return purpose === "voice-recording" || purpose === "transcribe-source"
    ? "voice-recordings"
    : "context-media";
}

export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const form = await request.formData();
    const file = form.get("file");
    const purpose = String(form.get("purpose") ?? "") as Purpose;
    const projectId = String(form.get("projectId") ?? "");
    const itemId = String(form.get("itemId") ?? "");

    if (!(file instanceof File)) return errorResponse("No file in the request", 400);
    if (!PURPOSES.includes(purpose)) return errorResponse("Unknown upload purpose", 400);
    if (purpose !== "transcribe-source" && !projectId) {
      return errorResponse("projectId is required", 400);
    }

    const mimeType = file.type || "application/octet-stream";
    const kind = kindFromMime(mimeType);
    const check = validateUpload({ size: file.size, name: file.name || "upload" }, kind);
    if (!check.ok) return errorResponse(check.error, 413);

    await assertQuotaFor(user.id, file.size);

    const extension = extensionFromMime(mimeType);
    const fileName = file.name || `upload.${extension}`;
    const key = (() => {
      switch (purpose) {
        case "main-image":
          return mainImageKey(user.id, projectId, extension);
        case "main-thumbnail":
          return mainThumbnailKey(user.id, projectId);
        case "context-media":
          return contextMediaKey(user.id, projectId, fileName);
        case "context-thumbnail":
          return contextThumbnailKey(user.id, projectId, fileName);
        case "context-audio":
          return contextAudioKey(user.id, projectId, itemId || fileName, extension);
        case "voice-recording":
          return voiceRecordingKey(user.id, projectId, itemId || fileName, extension);
        case "transcribe-source":
          return tempTranscribeKey(user.id, itemId || `${Date.now()}`, extension);
      }
    })();

    const bucket = bucketFor(purpose);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await getServices().blobs.put(bucket, key, bytes, { contentType: mimeType });

    // Scratch uploads for transcription are deleted straight after use, so
    // they are not part of the library.
    if (purpose !== "transcribe-source") {
      await getServices().assets.record(user.id, {
        mediaType: MEDIA_TYPE[purpose],
        mimeType,
        fileName,
        bucket,
        key,
        thumbnailKey: null,
        fileSize: stored.size,
        width: null,
        height: null,
        duration: null,
      });
    }

    return json({
      bucket,
      key,
      url: blobUrl(bucket, key, { projectId: bucket === "context-media" ? undefined : projectId }),
      size: stored.size,
      mimeType,
    });
  } catch (error) {
    return handleRouteError(error, "Upload failed");
  }
}
