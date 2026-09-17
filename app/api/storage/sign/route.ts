/**
 * POST /api/storage/sign — a short-lived link to one of the caller's own
 * private objects, used by the export engine.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { isBucketName } from "@/lib/ports/blob-storage";
import { blobUrl } from "@/lib/storage/blob-url";
import { isOwnedBy, isValidBlobKey } from "@/lib/storage/keys";
import { signBlobUrl } from "@/lib/server/blob-urls";
import {
  assertSameOrigin,
  errorResponse,
  handleRouteError,
  json,
  unauthorized,
} from "@/lib/server/http";
import { getServerUser } from "@/lib/server/session";
import { BUCKETS } from "@/lib/ports/blob-storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const body = (await request.json()) as { bucket?: string; path?: string; key?: string };
    const bucket = body.bucket ?? "";
    const key = body.key ?? body.path ?? "";

    if (!isBucketName(bucket) || !isValidBlobKey(key)) {
      return errorResponse("Unknown object", 400);
    }
    if (!isOwnedBy(key, user.id)) return errorResponse("Not your file", 403);

    const signedUrl =
      BUCKETS[bucket].visibility === "public" ? blobUrl(bucket, key) : signBlobUrl(bucket, key);
    return json({ signedUrl });
  } catch (error) {
    return handleRouteError(error, "Could not sign the file URL");
  }
}
