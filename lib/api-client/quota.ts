/**
 * Storage quota for the editor's upload guards.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

"use client";

import { evaluateQuota } from "@/lib/upload-limits";
import { quota, type QuotaSnapshot } from "./storage";

export type UserQuota = QuotaSnapshot;

export const getUserQuota = (): Promise<UserQuota> => quota();

/**
 * Would these bytes fit? Fails open on a lookup error — the upload route
 * checks the quota again server-side.
 */
export async function checkQuotaForUpload(
  incomingBytes: number,
): Promise<{ ok: true } | { ok: false; used: number; limit: number; plan: string }> {
  if (incomingBytes <= 0) return { ok: true };

  try {
    const snapshot = await quota();
    if (evaluateQuota(snapshot.used, incomingBytes, snapshot.limit).fits) return { ok: true };
    return { ok: false, used: snapshot.used, limit: snapshot.limit, plan: snapshot.plan };
  } catch {
    return { ok: true };
  }
}
