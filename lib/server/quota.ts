/**
 * Storage quota. Plans come from configuration now that there is no admin
 * area to assign them per account.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { getServices } from "@/lib/adapters";
import { getConfig } from "@/lib/config/server-config";
import { QuotaExceededError } from "@/lib/ports/errors";
import { evaluateQuota, resolvePlanLimit, type UserPlan } from "@/lib/upload-limits";

export interface QuotaSnapshot {
  used: number;
  limit: number;
  plan: UserPlan;
  ratio: number;
}

export async function getQuota(ownerId: string): Promise<QuotaSnapshot> {
  const config = getConfig();
  const used = await getServices().assets.totalBytes(ownerId);
  const limit = resolvePlanLimit(config.defaultPlan, config.storageLimitBytes);
  return { used, limit, plan: config.defaultPlan, ratio: evaluateQuota(used, 0, limit).ratio };
}

export async function assertQuotaFor(ownerId: string, incomingBytes: number): Promise<void> {
  if (incomingBytes <= 0) return;
  const { used, limit } = await getQuota(ownerId);
  if (!evaluateQuota(used, incomingBytes, limit).fits) {
    throw new QuotaExceededError(used, limit, incomingBytes);
  }
}
