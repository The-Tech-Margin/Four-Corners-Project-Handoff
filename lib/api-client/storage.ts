/**
 * Uploads, signed links, quota and the media library — all through the
 * app's own routes.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { UserAsset } from "@/lib/field-registry";
import type { BucketName } from "@/lib/ports/blob-storage";
import { apiFetch, apiGet, apiSend } from "./http";

export type UploadPurpose =
  | "main-image"
  | "main-thumbnail"
  | "context-media"
  | "context-thumbnail"
  | "context-audio"
  | "voice-recording"
  | "transcribe-source";

export interface UploadResult {
  bucket: BucketName;
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface UploadInput {
  purpose: UploadPurpose;
  blob: Blob;
  fileName: string;
  projectId?: string;
  itemId?: string;
}

export async function upload(input: UploadInput): Promise<UploadResult> {
  const form = new FormData();
  form.append("purpose", input.purpose);
  form.append("file", input.blob, input.fileName);
  if (input.projectId) form.append("projectId", input.projectId);
  if (input.itemId) form.append("itemId", input.itemId);

  return apiFetch<UploadResult>("/api/storage/upload", { method: "POST", body: form });
}

export const signUrl = (bucket: BucketName, key: string): Promise<{ signedUrl: string }> =>
  apiSend("/api/storage/sign", "POST", { bucket, key });

export interface QuotaSnapshot {
  used: number;
  limit: number;
  plan: string;
  ratio: number;
}

export const quota = (): Promise<QuotaSnapshot> => apiGet("/api/storage/quota");

export const listAssets = (params: {
  query?: string;
  mediaTypes?: string[];
  sort?: "newest" | "oldest";
  limit?: number;
  offset?: number;
}): Promise<{ assets: UserAsset[]; hasMore: boolean }> => {
  const search = new URLSearchParams();
  if (params.query) search.set("q", params.query);
  for (const mediaType of params.mediaTypes ?? []) search.append("mediaType", mediaType);
  if (params.sort) search.set("sort", params.sort);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  return apiGet(`/api/assets?${search.toString()}`);
};

export const deleteAsset = (id: string): Promise<{ ok: true }> =>
  apiSend(`/api/assets/${encodeURIComponent(id)}`, "DELETE");
