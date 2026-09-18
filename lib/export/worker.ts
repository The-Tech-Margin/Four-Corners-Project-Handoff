/**
 * Export Web Worker — message loop around runExport. Keeps base64 encoding,
 * asset fetching, and ZIP deflate off the main thread.
 */

import { runExport } from "./engine";
import type { ExportOptions, ExportProjectInput } from "./types";

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

const ctx = self as unknown as WorkerScope;

interface StartMessage {
  input: ExportProjectInput;
  options: ExportOptions;
}

ctx.onmessage = async (event: MessageEvent) => {
  const { input, options } = event.data as StartMessage;
  try {
    const result = await runExport(input, options, (progress) => {
      ctx.postMessage({ type: "progress", progress });
    });
    ctx.postMessage({ type: "done", result });
  } catch (error) {
    ctx.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Export failed",
    });
  }
};
