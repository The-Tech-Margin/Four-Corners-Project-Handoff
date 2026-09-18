"use client";

import type { AutosaveStatus } from "@/hooks/useAutosave";

interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  error?: string | null;
}

export function AutosaveIndicator({ status, error }: AutosaveIndicatorProps) {
  if (status === "idle") return null;

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-gray-500"
      role="status"
      aria-live="polite"
    >
      {status === "waiting" && (
        <span className="text-gray-400/60">Unsaved changes</span>
      )}

      {status === "saving" && (
        <>
          <div className="w-3 h-3 border-[1.5px] border-gray-500 border-t-transparent rounded-full animate-spin" />
          <span>Saving...</span>
        </>
      )}

      {status === "saved" && (
        <span className="text-green-500/70">✓ Saved</span>
      )}

      {status === "error" && (
        <span className="text-red-400/70" title={error || "Autosave failed"}>
          Save failed
        </span>
      )}
    </div>
  );
}
