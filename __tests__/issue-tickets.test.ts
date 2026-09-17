/**
 * Issue ticketing — severity scale, derived priority, and update schemas.
 *
 * Pure unit tests over the shared schemas/helpers (no Supabase/DOM). Covers the
 * reporter-set 1–5 severity, the severity→priority mapping, and the reporter /
 * super-admin update validation (including that reporters cannot set status).
 */

import { describe, it, expect } from "vitest";
import {
  IssueReportSchema,
  ISSUE_SEVERITY_LEVELS,
  ISSUE_SEVERITY_INFO,
  priorityFromSeverity,
} from "@/lib/issue-schema";
import {
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  RESOLVING_STATUSES,
  TriageSchema,
  ReporterUpdateSchema,
} from "@/lib/issue-triage-schema";

describe("priorityFromSeverity", () => {
  it("maps severity 4–5 to High (priority 3)", () => {
    expect(priorityFromSeverity(5)).toBe(3);
    expect(priorityFromSeverity(4)).toBe(3);
  });
  it("maps severity 3 to Medium (priority 2)", () => {
    expect(priorityFromSeverity(3)).toBe(2);
  });
  it("maps severity 1–2 to Low (priority 1)", () => {
    expect(priorityFromSeverity(2)).toBe(1);
    expect(priorityFromSeverity(1)).toBe(1);
  });
});

describe("severity scale", () => {
  it("has five levels 1–5, each with a label + example", () => {
    expect([...ISSUE_SEVERITY_LEVELS]).toEqual([1, 2, 3, 4, 5]);
    for (const lvl of ISSUE_SEVERITY_LEVELS) {
      expect(ISSUE_SEVERITY_INFO[lvl]?.label).toBeTruthy();
      expect(ISSUE_SEVERITY_INFO[lvl]?.example).toBeTruthy();
    }
  });
});

describe("IssueReportSchema", () => {
  it("accepts a minimal report and defaults severity to 3 / type to bug", () => {
    const r = IssueReportSchema.parse({ description: "something broke" });
    expect(r.severity).toBe(3);
    expect(r.type).toBe("bug");
  });
  it("rejects a severity outside 1–5", () => {
    expect(IssueReportSchema.safeParse({ description: "x", severity: 0 }).success).toBe(false);
    expect(IssueReportSchema.safeParse({ description: "x", severity: 6 }).success).toBe(false);
    expect(IssueReportSchema.safeParse({ description: "x", severity: 2.5 }).success).toBe(false);
  });
  it("requires a non-empty description", () => {
    expect(IssueReportSchema.safeParse({}).success).toBe(false);
    expect(IssueReportSchema.safeParse({ description: "" }).success).toBe(false);
  });
  it("accepts the optional extra field and trims it", () => {
    const r = IssueReportSchema.parse({
      description: "x",
      extra: "  https://example.com/page  ",
    });
    expect(r.extra).toBe("https://example.com/page");
  });
  it("rejects extra over 2000 chars", () => {
    expect(
      IssueReportSchema.safeParse({ description: "x", extra: "a".repeat(2001) })
        .success,
    ).toBe(false);
  });
});

describe("ReporterUpdateSchema", () => {
  it("accepts a comment alone", () => {
    expect(ReporterUpdateSchema.safeParse({ comment: "any update?" }).success).toBe(true);
  });
  it("accepts an edit with at least one field", () => {
    expect(ReporterUpdateSchema.safeParse({ edit: { severity: 4 } }).success).toBe(true);
  });
  it("rejects an empty update", () => {
    expect(ReporterUpdateSchema.safeParse({}).success).toBe(false);
    expect(ReporterUpdateSchema.safeParse({ edit: {} }).success).toBe(false);
  });
  it("rejects an edit severity outside 1–5", () => {
    expect(ReporterUpdateSchema.safeParse({ edit: { severity: 9 } }).success).toBe(false);
  });
  it("does not let a reporter set status (status is not an allowed field)", () => {
    // `status` is stripped (unknown key); with nothing else provided the
    // refine fails, so the request is rejected outright.
    const parsed = ReporterUpdateSchema.safeParse({ status: "resolved" });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      expect(parsed.data as Record<string, unknown>).not.toHaveProperty("status");
    }
  });
});

describe("TriageSchema (super-admin)", () => {
  it("accepts a status change", () => {
    expect(TriageSchema.safeParse({ status: "resolved" }).success).toBe(true);
  });
  it("accepts assignee 'me' or null", () => {
    expect(TriageSchema.safeParse({ assignee: "me" }).success).toBe(true);
    expect(TriageSchema.safeParse({ assignee: null }).success).toBe(true);
  });
  it("rejects an empty triage payload", () => {
    expect(TriageSchema.safeParse({}).success).toBe(false);
  });
  it("rejects priority outside 0–3", () => {
    expect(TriageSchema.safeParse({ priority: 5 }).success).toBe(false);
    expect(TriageSchema.safeParse({ priority: 2 }).success).toBe(true);
  });
  it("rejects an unknown status", () => {
    expect(TriageSchema.safeParse({ status: "nope" }).success).toBe(false);
  });
  it("accepts a type reclassification", () => {
    expect(TriageSchema.safeParse({ type: "visual" }).success).toBe(true);
  });
  it("rejects an unknown type", () => {
    expect(TriageSchema.safeParse({ type: "nope" }).success).toBe(false);
  });
});

describe("ReporterUpdateSchema extra field", () => {
  it("accepts an edit to extra", () => {
    expect(
      ReporterUpdateSchema.safeParse({ edit: { extra: "https://example.com" } })
        .success,
    ).toBe(true);
  });
});

describe("status constants", () => {
  it("every resolving status is a valid status", () => {
    for (const s of RESOLVING_STATUSES) expect(ISSUE_STATUSES).toContain(s);
  });
  it("every status has a human label", () => {
    for (const s of ISSUE_STATUSES) expect(ISSUE_STATUS_LABELS[s]).toBeTruthy();
  });
});
