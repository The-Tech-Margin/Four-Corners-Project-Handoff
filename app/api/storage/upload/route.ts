import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";
import { apiError } from "@/lib/api-error";
import { recordAsset } from "@/lib/db/user-assets";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  formatBytes,
  kindFromMime,
  kindLabel,
} from "@/lib/upload-limits";
import { checkQuotaForUpload } from "@/lib/db/user-storage";

/**
 * POST /api/storage/upload - Upload file to Supabase Storage
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const bucket = formData.get("bucket") as string;
    const path = formData.get("path") as string;

    if (!file || !bucket || !path) {
      return NextResponse.json(
        { error: "Missing required fields: file, bucket, path" },
        { status: 400 }
      );
    }

    // Validate file type — images, videos, and documents (consent forms etc.)
    // Video list comes from ALLOWED_VIDEO_MIME_TYPES so the editor + this
    // defensive endpoint can't drift apart.
    const ALLOWED_TYPES = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
      // Videos
      ...ALLOWED_VIDEO_MIME_TYPES,
      // Documents (consent forms, PDFs, Word)
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: images, videos, PDF, Word, text" },
        { status: 400 }
      );
    }

    // Per-file size check — uses the shared limits table so client + server
    // enforce the same caps. Kind is inferred from MIME since this route is a
    // catch-all and can't tell which UI surfaced it.
    const kind = kindFromMime(file.type);
    const maxBytes = MAX_UPLOAD_BYTES[kind];
    if (file.size > maxBytes) {
      return NextResponse.json(
        {
          error: `${file.name} is ${formatBytes(file.size)} — ${kindLabel(kind)}s must be under ${formatBytes(maxBytes)}.`,
        },
        { status: 413 },
      );
    }

    // Per-user storage quota — block uploads that would push the user over
    // their plan's limit. Defence-in-depth: the UI checks too, but a direct
    // POST bypassing the UI must be caught here.
    const quota = await checkQuotaForUpload(user.id, file.size);
    if (!quota.ok) {
      return NextResponse.json(
        {
          error: `You've used ${formatBytes(quota.used)} of your ${formatBytes(quota.limit)} storage (${quota.plan} plan). Remove some assets or upgrade to add more.`,
        },
        { status: 413 },
      );
    }

    // Sanitize bucket name - only allow alphanumeric and hyphens
    if (!/^[a-z0-9-]+$/.test(bucket)) {
      return NextResponse.json(
        { error: "Invalid bucket name" },
        { status: 400 }
      );
    }

    // Sanitize path - prevent directory traversal
    const sanitizedPath = path.replace(/\.\./g, "").replace(/^\/+/, "");
    if (sanitizedPath !== path || path.includes("..")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    // Upload to Supabase Storage with user ID prefix for isolation
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(`${user.id}/${sanitizedPath}`, file, {
        upsert: true,
        contentType: file.type,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(data.path);

    // Index in the user's library (fire-and-forget).
    const mediaType: "image" | "video" | "audio" | "document" =
      file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("image/")
            ? "image"
            : "document";
    void recordAsset({
      mediaType,
      mimeType: file.type,
      fileName: file.name,
      storageBucket: bucket,
      storagePath: data.path,
      storageUrl: publicUrl,
      fileSize: file.size,
    });

    return NextResponse.json({
      path: data.path,
      publicUrl,
    });
  } catch (error) {
    return apiError(error, "Failed to upload file");
  }
}
