/**
 * Who may read a blob.
 *
 * Three independent grants:
 *   owner      the key's first segment is the requester's id
 *   project    `?project=<id>` names a published project that references the
 *              key, and the key belongs to that project's owner
 *   signature  a short-lived signed link minted for the owner
 *
 * Public buckets are readable by key, matching how the original deployment
 * served context media.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { getServices } from "@/lib/adapters";
import { BUCKETS, type BucketName } from "@/lib/ports/blob-storage";
import { referencesKey } from "@/lib/projects/blob-refs";
import { isOwnedBy } from "@/lib/storage/keys";
import { verifyBlobSignature } from "./blob-urls";

export interface BlobAccessRequest {
  bucket: BucketName;
  key: string;
  viewerId: string | null;
  projectId: string | null;
  exp: string | null;
  sig: string | null;
}

export async function canReadBlob(request: BlobAccessRequest): Promise<boolean> {
  const { bucket, key, viewerId, projectId, exp, sig } = request;

  if (viewerId && isOwnedBy(key, viewerId)) return true;
  if (BUCKETS[bucket].visibility === "public") return true;
  if (verifyBlobSignature(bucket, key, exp, sig)) return true;

  if (projectId) {
    const project = await getServices().projects.getById(projectId);
    if (
      project?.published &&
      isOwnedBy(key, project.ownerId) &&
      referencesKey(project, bucket, key)
    ) {
      return true;
    }
  }

  return false;
}
