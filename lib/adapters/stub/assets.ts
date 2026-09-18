/**
 * Asset library stub.
 *
 * A production adapter must key assets by (owner, bucket, key) so a repeated
 * upload updates one row, and must make `totalBytes` cheap: it runs on every
 * upload to enforce the storage quota.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { UserAssetRepository } from "@/lib/ports/assets";
import { NotConfiguredError } from "@/lib/ports/errors";

const fail = (): never => {
  throw new NotConfiguredError(
    "UserAssetRepository",
    "FC_DATA_ADAPTER",
    "Implement lib/ports/assets.ts against your database.",
  );
};

export function createStubAssetRepository(): UserAssetRepository {
  return {
    record: fail,
    attachThumbnail: fail,
    list: fail,
    findByKey: fail,
    delete: fail,
    totalBytes: fail,
  };
}
