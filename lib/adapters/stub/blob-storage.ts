/**
 * Blob storage stub.
 *
 * A production adapter must:
 *  - treat keys as opaque and preserve them exactly (the first segment is the
 *    owner id, which is how access is checked);
 *  - support byte ranges, or audio and video scrubbing breaks in Safari;
 *  - return the stored content type, since the blob route serves it verbatim.
 *
 * Objects are addressed through the app's own /api/blobs route, so an adapter
 * never has to mint vendor URLs.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { BlobStoragePort } from "@/lib/ports/blob-storage";
import { NotConfiguredError } from "@/lib/ports/errors";

const fail = (): never => {
  throw new NotConfiguredError(
    "BlobStoragePort",
    "FC_BLOB_ADAPTER",
    "Implement lib/ports/blob-storage.ts against your object store.",
  );
};

export function createStubBlobStorage(): BlobStoragePort {
  return {
    put: fail,
    get: fail,
    head: fail,
    copy: fail,
    delete: fail,
    usageForOwner: fail,
  };
}
