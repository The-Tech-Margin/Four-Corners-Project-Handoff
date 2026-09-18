/**
 * GET /api/assets — the caller's uploaded media library.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import type { AssetMediaType } from "@/lib/ports/assets";
import { blobUrl } from "@/lib/storage/blob-url";
import { handleRouteError, json, unauthorized } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const MEDIA_TYPES: AssetMediaType[] = ["image", "video", "audio", "document"];

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { searchParams } = request.nextUrl;
    const requested = searchParams.getAll("mediaType").filter((value): value is AssetMediaType =>
      MEDIA_TYPES.includes(value as AssetMediaType),
    );

    const { assets, hasMore } = await getServices().assets.list(user.id, {
      query: searchParams.get("q") ?? undefined,
      mediaTypes: requested.length ? requested : undefined,
      sort: searchParams.get("sort") === "oldest" ? "oldest" : "newest",
      limit: Math.min(Number(searchParams.get("limit")) || 50, 100),
      offset: Math.max(Number(searchParams.get("offset")) || 0, 0),
    });

    return json({
      assets: assets.map((asset) => ({
        id: asset.id,
        userId: asset.ownerId,
        mediaType: asset.mediaType,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        storageBucket: asset.bucket,
        storagePath: asset.key,
        storageUrl: blobUrl(asset.bucket, asset.key),
        thumbnailStoragePath: asset.thumbnailKey,
        thumbnailStorageUrl: asset.thumbnailKey
          ? blobUrl(asset.bucket, asset.thumbnailKey)
          : null,
        fileSize: asset.fileSize,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
        createdAt: asset.createdAt,
      })),
      hasMore,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to load the media library");
  }
}
