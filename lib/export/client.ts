"use client";

/**
 * Client entry for the export engine. Prefers a Web Worker; falls back to a
 * main-thread dynamic import of the engine — permanently for the session
 * once the worker proves broken (construction throws or the module fails to
 * load), so users never pay a failed-worker roundtrip twice.
 */

import type {
  ExportOptions,
  ExportProgress,
  ExportProjectInput,
  ExportResult,
} from "./types";

export class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "ExportCancelledError";
  }
}

export interface ExportRun {
  promise: Promise<ExportResult>;
  cancel: () => void;
}

let workerBroken = false;

function startMainThread(
  input: ExportProjectInput,
  options: ExportOptions,
  onProgress?: (progress: ExportProgress) => void,
): ExportRun {
  let cancelled = false;
  const promise = import("./engine").then(({ runExport }) => {
    if (cancelled) throw new ExportCancelledError();
    return runExport(input, options, (progress) => {
      if (!cancelled) onProgress?.(progress);
    });
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}

export function startExport(
  input: ExportProjectInput,
  options: ExportOptions,
  onProgress?: (progress: ExportProgress) => void,
): ExportRun {
  if (workerBroken || typeof Worker === "undefined") {
    return startMainThread(input, options, onProgress);
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    workerBroken = true;
    return startMainThread(input, options, onProgress);
  }

  let settled = false;
  let rejectRef: ((reason: Error) => void) | null = null;

  const promise = new Promise<ExportResult>((resolve, reject) => {
    rejectRef = reject;

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: "progress"; progress: ExportProgress }
        | { type: "done"; result: ExportResult }
        | { type: "error"; message: string };
      if (data.type === "progress") {
        onProgress?.(data.progress);
      } else if (data.type === "done") {
        settled = true;
        worker.terminate();
        resolve(data.result);
      } else {
        settled = true;
        worker.terminate();
        reject(new Error(data.message));
      }
    };

    // Load/eval failure of the worker module itself — retry on the main
    // thread and stop trying workers for the rest of the session.
    worker.onerror = () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      workerBroken = true;
      startMainThread(input, options, onProgress).promise.then(resolve, reject);
    };

    worker.postMessage({ input, options });
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectRef?.(new ExportCancelledError());
    },
  };
}
