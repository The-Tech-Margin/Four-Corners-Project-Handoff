/**
 * Admin Settings — global app settings / feature flags.
 *
 * Each entry in SETTINGS renders as a labelled toggle. To add a new boolean
 * flag: append to SETTINGS here AND to KNOWN_SETTINGS in the admin route AND
 * to PUBLIC_SETTINGS in the public route (if it should be readable anon).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useEffect, useState } from "react";
import { SectionHeading } from "@/components/admin/stat-card";

type BooleanSetting = {
  key: string;
  label: string;
  description: string;
};

const SETTINGS: BooleanSetting[] = [
  {
    key: "gallery_explore_enabled",
    label: "Show Explore tab on project views",
    description:
      "When off, only project owners see the Explore tab (card-list connections view) on their own projects. Gallery visitors see neither the tab nor its content, including via direct ?tab=explore links.",
  },
];

type SettingState = {
  loading: boolean;
  saving: boolean;
  value: boolean;
  error: string | null;
};

export default function AdminSettingsPage() {
  const [states, setStates] = useState<Record<string, SettingState>>(() =>
    Object.fromEntries(
      SETTINGS.map((s) => [
        s.key,
        { loading: true, saving: false, value: false, error: null },
      ]),
    ),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const s of SETTINGS) {
        try {
          const res = await fetch(`/api/admin/settings/${s.key}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setStates((prev) => ({
            ...prev,
            [s.key]: {
              loading: false,
              saving: false,
              value: data?.value === true,
              error: null,
            },
          }));
        } catch (err) {
          if (cancelled) return;
          setStates((prev) => ({
            ...prev,
            [s.key]: {
              loading: false,
              saving: false,
              value: false,
              error: err instanceof Error ? err.message : "Load failed",
            },
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: string, next: boolean) {
    setStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], saving: true, error: null },
    }));
    try {
      const res = await fetch(`/api/admin/settings/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setStates((prev) => ({
        ...prev,
        [key]: { loading: false, saving: false, value: next, error: null },
      }));
    } catch (err) {
      setStates((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          saving: false,
          error: err instanceof Error ? err.message : "Save failed",
        },
      }));
    }
  }

  return (
    <div>
      <h2
        className="text-base font-semibold mb-4"
        style={{ color: "var(--fc-text)" }}
      >
        Global Settings
      </h2>

      <SectionHeading>Feature flags</SectionHeading>

      <div className="flex flex-col gap-2">
        {SETTINGS.map((s) => {
          const state = states[s.key];
          return (
            <div
              key={s.key}
              className="rounded-md p-3 flex items-start gap-3"
              style={{
                background: "var(--fc-surface)",
                border: "1px solid var(--fc-border)",
              }}
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--fc-text)" }}
                >
                  {s.label}
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--fc-text-muted)" }}
                >
                  {s.description}
                </p>
                {state.error && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--fc-danger)" }}
                    role="alert"
                  >
                    {state.error}
                  </p>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={state.value}
                aria-label={s.label}
                disabled={state.loading || state.saving}
                onClick={() => toggle(s.key, !state.value)}
                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
                style={{
                  background: state.value
                    ? "var(--fc-accent)"
                    : "var(--fc-wash)",
                  border: `1px solid ${state.value ? "var(--fc-accent)" : "var(--fc-border)"}`,
                }}
              >
                <span
                  className="inline-block h-4 w-4 rounded-full transition-transform"
                  style={{
                    background: state.value
                      ? "var(--fc-accent-on)"
                      : "var(--fc-text-muted)",
                    transform: state.value
                      ? "translateX(22px)"
                      : "translateX(4px)",
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
