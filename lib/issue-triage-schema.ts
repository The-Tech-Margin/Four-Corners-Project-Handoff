/**
 * Ticket update schemas — reporter edits + super-admin triage.
 *
 * Shared by the reporter PATCH (`/api/issues/[id]`) and the admin triage PATCH
 * (`/api/admin/issues/[id]`). Status/resolution constants mirror the CHECK
 * constraints in migration 049. Updates are additive: each change is also
 * recorded as an `issue_report_events` row (see migration 050).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { z } from "zod";
import { ISSUE_TYPES } from "@/lib/issue-schema";

/** Ticket lifecycle states (matches issue_reports.status CHECK). */
export const ISSUE_STATUSES = [
  "open",
  "triaged",
  "in_progress",
  "resolved",
  "wont_fix",
  "duplicate",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open",
  triaged: "Triaged",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
};

/** Reaching one of these resolves the ticket: stamp resolved_at + delete screenshot. */
export const RESOLVING_STATUSES: IssueStatus[] = [
  "resolved",
  "wont_fix",
  "duplicate",
];

export const ISSUE_PRIORITIES = [0, 1, 2, 3] as const;
export const ISSUE_PRIORITY_LABELS: Record<number, string> = {
  0: "None",
  1: "Low",
  2: "Medium",
  3: "High",
};

/* ------------------------------------------------------------------ */
/*  Reporter edit — a signed-in reporter updates their own ticket      */
/* ------------------------------------------------------------------ */

/** Editable user-facing fields (everything else is auto-captured / server-set). */
export const ReporterEditFields = z.object({
  type: z.enum(ISSUE_TYPES).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  steps: z.string().trim().max(5000).optional(),
  extra: z.string().trim().max(2000).optional(),
});

export const ReporterUpdateSchema = z
  .object({
    comment: z.string().trim().min(1).max(5000).optional(),
    edit: ReporterEditFields.optional(),
  })
  .refine(
    (v) => v.comment !== undefined || (v.edit && Object.keys(v.edit).length > 0),
    { message: "Provide a comment or at least one field to edit" },
  );

export type ReporterUpdateInput = z.infer<typeof ReporterUpdateSchema>;

/* ------------------------------------------------------------------ */
/*  Admin triage — super-admin updates lifecycle/ownership fields      */
/* ------------------------------------------------------------------ */

export const TriageSchema = z
  .object({
    status: z.enum(ISSUE_STATUSES).optional(),
    // Reporters no longer pick a type at intake; admins classify at triage.
    type: z.enum(ISSUE_TYPES).optional(),
    priority: z.number().int().min(0).max(3).nullable().optional(),
    resolution: z.string().trim().max(2000).nullable().optional(),
    // "me" assigns to the acting super-admin; null unassigns; a uuid assigns directly.
    assignee: z.union([z.literal("me"), z.null(), z.string().uuid()]).optional(),
    comment: z.string().trim().min(1).max(5000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one triage field to update",
  });

export type TriageInput = z.infer<typeof TriageSchema>;
