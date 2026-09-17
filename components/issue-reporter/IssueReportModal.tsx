/**
 * IssueReportModal — the issue intake form.
 *
 * The only structured input is the severity number (1–5); everything else is
 * a plain-language question ("What were you trying to do?", "What did you
 * enter or click?", "Add a link or anything else?"). Type is not asked —
 * tickets default to "bug" and admins classify at triage. Submits with
 * auto-captured context. The page screenshot is captured on mount with
 * the reporter UI itself excluded (everything here is marked data-fc-private);
 * on capture failure the user can attach a file manually.
 *
 * Colors come from `--fc-*` tokens so it inherits dark/light + persona.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { VoiceTextarea } from "@/components/voice-textarea";
import {
  ISSUE_SEVERITY_LEVELS,
  ISSUE_SEVERITY_INFO,
  type IssueSeverity,
} from "@/lib/issue-schema";
import { captureContext, type CapturedContext } from "@/lib/issue-capture";
import { captureScreenshot, fileToDataUrl } from "@/lib/screenshot";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

interface Props {
  defaultEmail: string | null;
  onClose: () => void;
}

export function IssueReportModal({ defaultEmail, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [severity, setSeverity] = useState<IssueSeverity>(3);
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [extra, setExtra] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");

  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);

  const [context, setContext] = useState<CapturedContext | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotFailed, setScreenshotFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Capture context + screenshot once, on mount. The reporter UI is excluded
  // from the screenshot via the data-fc-private filter in captureScreenshot.
  useEffect(() => {
    setContext(captureContext());
    let cancelled = false;
    captureScreenshot(dialogRef.current).then((res) => {
      if (cancelled) return;
      if (res.ok && res.dataUrl) setScreenshot(res.dataUrl);
      else setScreenshotFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Focus management: move focus into the dialog on open, trap Tab within it,
  // close on Escape, and restore focus to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (active && !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const handleManualAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setScreenshot(dataUrl);
      setScreenshotFailed(false);
    } catch {
      toast.error("Couldn't read that image");
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Please tell us what you were trying to do");
      return;
    }
    setSubmitting(true);
    try {
      const ctx = context ?? captureContext();
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // No type — the schema defaults to "bug"; admins classify at triage.
          severity,
          description: description.trim(),
          steps: steps.trim() || undefined,
          extra: extra.trim() || undefined,
          url: ctx.url,
          route: ctx.route,
          referrer: ctx.referrer,
          app_state: ctx.app_state,
          device: ctx.device,
          diagnostics: ctx.diagnostics,
          user_agent: ctx.user_agent,
          captured_at: ctx.captured_at,
          consent_screenshot: includeScreenshot,
          consent_diagnostics: includeDiagnostics,
          screenshot:
            includeScreenshot && screenshot ? screenshot : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Submit failed");
      }

      toast.success("Thanks — ticket submitted");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  const labelStyle = { color: "var(--fc-text-secondary)" } as const;

  return (
    <div
      data-fc-private
      role="dialog"
      aria-modal="true"
      aria-label="Report an issue"
      className="fixed inset-0 z-[9500] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.55)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-xl overflow-hidden flex flex-col max-h-[90vh] focus:outline-none"
        style={{
          background: "var(--fc-bg)",
          border: "1px solid var(--fc-border)",
          color: "var(--fc-text)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--fc-border)" }}
        >
          <h2 className="text-sm font-semibold">Report an issue</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center rounded transition-colors"
            style={{ width: 28, height: 28, color: "var(--fc-text-muted)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Severity — segmented */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium" style={labelStyle}>
              Severity — how badly is this blocking you? (1–5)
            </span>
            <div
              className="flex rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--fc-border)" }}
              role="group"
              aria-label="Severity"
              aria-describedby="issue-severity-example"
            >
              {ISSUE_SEVERITY_LEVELS.map((s) => {
                const active = severity === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    aria-pressed={active}
                    aria-label={`Severity ${s}: ${ISSUE_SEVERITY_INFO[s].label}`}
                    title={`${s} — ${ISSUE_SEVERITY_INFO[s].label}`}
                    className="flex-1 px-2 py-1.5 text-xs font-medium transition-colors tabular-nums"
                    style={{
                      background: active ? "var(--fc-accent)" : "transparent",
                      color: active
                        ? "var(--fc-accent-on)"
                        : "var(--fc-text-secondary)",
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <p
              id="issue-severity-example"
              aria-live="polite"
              className="text-[11px] leading-snug"
              style={{ color: "var(--fc-text-muted)" }}
            >
              <span
                className="font-medium"
                style={{ color: "var(--fc-text-secondary)" }}
              >
                {ISSUE_SEVERITY_INFO[severity].label}
              </span>{" "}
              — {ISSUE_SEVERITY_INFO[severity].example}
            </p>
          </div>

          {/* What were you trying to do? (required) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={labelStyle}>
              What were you trying to do?
            </label>
            <VoiceTextarea
              value={description}
              onChange={setDescription}
              placeholder="e.g. Saving my project after adding a photo…"
              ariaLabel="What were you trying to do?"
              rows={4}
              fieldId="issue-description"
            />
          </div>

          {/* What did you enter or click? (optional) */}
          <div className="space-y-1.5">
            <label htmlFor="issue-steps" className="text-xs font-medium" style={labelStyle}>
              What did you enter or click? (optional)
            </label>
            <textarea
              id="issue-steps"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={2}
              placeholder="The buttons you pressed, text you typed, files you added…"
              className="w-full rounded-lg px-3 py-2 text-sm resize-y"
              style={{
                background: "var(--fc-surface)",
                border: "1px solid var(--fc-border)",
                color: "var(--fc-text)",
              }}
            />
          </div>

          {/* Add a link or anything else? (optional) */}
          <div className="space-y-1.5">
            <label htmlFor="issue-extra" className="text-xs font-medium" style={labelStyle}>
              Add a link or anything else? (optional)
            </label>
            <input
              id="issue-extra"
              type="text"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="A link to the page, or anything we should know"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--fc-surface)",
                border: "1px solid var(--fc-border)",
                color: "var(--fc-text)",
              }}
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="issue-email" className="text-xs font-medium" style={labelStyle}>
              Email (for follow-up)
            </label>
            <input
              id="issue-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--fc-surface)",
                border: "1px solid var(--fc-border)",
                color: "var(--fc-text)",
              }}
            />
          </div>

          {/* Screenshot toggle + thumbnail */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium leading-none" style={labelStyle}>
              <input
                type="checkbox"
                checked={includeScreenshot}
                onChange={(e) => setIncludeScreenshot(e.target.checked)}
                style={{ width: 14, height: 14 }}
              />
              Include screenshot
            </label>
            {includeScreenshot && (
              <div className="pl-6">
                {screenshot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={screenshot}
                    alt="Captured screenshot preview"
                    className="rounded-md max-h-32 w-auto"
                    style={{ border: "1px solid var(--fc-border)" }}
                  />
                ) : screenshotFailed ? (
                  <div className="text-xs space-y-1" style={{ color: "var(--fc-text-muted)" }}>
                    <span>Auto-capture didn&apos;t work here.</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleManualAttach}
                      className="block text-xs"
                      aria-label="Attach a screenshot manually"
                    />
                  </div>
                ) : (
                  <span className="text-xs" style={{ color: "var(--fc-text-muted)" }}>
                    Capturing…
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Diagnostics toggle + expander */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium leading-none" style={labelStyle}>
              <input
                type="checkbox"
                checked={includeDiagnostics}
                onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                style={{ width: 14, height: 14 }}
              />
              Include diagnostics
            </label>
            {includeDiagnostics && context && (
              <div className="pl-6">
                <DiagnosticsPanel context={context} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid var(--fc-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ color: "var(--fc-text-secondary)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !description.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: "var(--fc-accent)",
              color: "var(--fc-accent-on)",
            }}
          >
            {submitting ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
