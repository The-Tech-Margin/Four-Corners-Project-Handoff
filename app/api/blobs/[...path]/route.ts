/**
 * GET /api/blobs/<bucket>/<key> — serve a stored object.
 *
 * Access is decided in lib/server/blob-access.ts: the owner, a published
 * project that references the object, or a signed link. Responses are sent
 * with sniffing disabled and a sandbox policy, because the bytes came from
 * a user.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { NextResponse, type NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import { isBucketName } from "@/lib/ports/blob-storage";
import { isValidBlobKey } from "@/lib/storage/keys";
import { canReadBlob } from "@/lib/server/blob-access";
import { errorResponse, handleRouteError } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const INLINE_TYPES = /^(image|audio|video)\//;

function parseRange(header: string | null, totalSize: number) {
  if (!header) return undefined;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return undefined;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return undefined;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    return { start: Math.max(totalSize - suffix, 0), end: totalSize - 1 };
  }
  return { start: Number(rawStart), end: rawEnd === "" ? undefined : Number(rawEnd) };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    const [bucket, ...keyParts] = path;
    const key = keyParts.map(decodeURIComponent).join("/");

    if (!bucket || !isBucketName(bucket) || !isValidBlobKey(key)) {
      return errorResponse("Not found", 404);
    }

    const { searchParams } = request.nextUrl;
    const viewer = await getServerUser();
    const allowed = await canReadBlob({
      bucket,
      key,
      viewerId: viewer?.id ?? null,
      projectId: searchParams.get("project"),
      exp: searchParams.get("exp"),
      sig: searchParams.get("sig"),
    });
    if (!allowed) return errorResponse("Not found", 404);

    const blobs = getServices().blobs;
    const stat = await blobs.head(bucket, key);
    if (!stat) return errorResponse("Not found", 404);

    if (request.headers.get("if-none-match") === stat.etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: stat.etag } });
    }

    const range = parseRange(request.headers.get("range"), stat.size);
    const object = await blobs.get(bucket, key, range);
    if (!object) return errorResponse("Not found", 404);

    const inline = INLINE_TYPES.test(object.contentType);
    const headers = new Headers({
      "Content-Type": object.contentType,
      "Content-Length": String(object.size),
      ETag: object.etag,
      "Last-Modified": object.lastModified,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": inline ? "inline" : "attachment",
      "Cache-Control": "private, max-age=300",
    });

    if (range) {
      const end = range.end ?? object.totalSize - 1;
      headers.set("Content-Range", `bytes ${range.start}-${end}/${object.totalSize}`);
      return new NextResponse(object.stream, { status: 206, headers });
    }

    return new NextResponse(object.stream, { status: 200, headers });
  } catch (error) {
    return handleRouteError(error, "Failed to read the file");
  }
}
