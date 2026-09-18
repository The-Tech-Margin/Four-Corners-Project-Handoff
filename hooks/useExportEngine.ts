"use client";

/**
 * React binding for the export engine: start/cancel + status/progress/result
 * state. One export at a time per hook instance; starting a new run cancels
 * the previous one, and unmount cancels whatever is in flight.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startExport,
  ExportCancelledError,
  type ExportRun,
} from "@/lib/export/client";
import type {
  ExportOptions,
  ExportProgress,
  ExportProjectInput,
  ExportResult,
} from "@/lib/export/types";

export type ExportEngineStatus = "idle" | "running" | "done" | "error";

export interface UseExportEngine {
  start: (
    input: ExportProjectInput,
    options: ExportOptions,
  ) => Promise<ExportResult | null>;
  cancel: () => void;
  status: ExportEngineStatus;
  progress: ExportProgress | null;
  warnings: string[];
  result: ExportResult | null;
  error: string | null;
}

export function useExportEngine(): UseExportEngine {
  const [status, setStatus] = useState<ExportEngineStatus>("idle");
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef<ExportRun | null>(null);

  const cancel = useCallback(() => {
    runRef.current?.cancel();
    runRef.current = null;
    setStatus("idle");
    setProgress(null);
  }, []);

  useEffect(() => {
    return () => {
      runRef.current?.cancel();
    };
  }, []);

  const start = useCallback(
    async (
      input: ExportProjectInput,
      options: ExportOptions,
    ): Promise<ExportResult | null> => {
      runRef.current?.cancel();
      setStatus("running");
      setProgress(null);
      setWarnings([]);
      setResult(null);
      setError(null);

      const run = startExport(input, options, setProgress);
      runRef.current = run;

      try {
        const exportResult = await run.promise;
        if (runRef.current !== run) return null; // superseded or cancelled
        runRef.current = null;
        setResult(exportResult);
        setWarnings(exportResult.summary.warnings);
        setStatus("done");
        return exportResult;
      } catch (err) {
        if (err instanceof ExportCancelledError) return null;
        if (runRef.current !== run) return null;
        runRef.current = null;
        setError(err instanceof Error ? err.message : "Export failed");
        setStatus("error");
        return null;
      }
    },
    [],
  );

  return { start, cancel, status, progress, warnings, result, error };
}
