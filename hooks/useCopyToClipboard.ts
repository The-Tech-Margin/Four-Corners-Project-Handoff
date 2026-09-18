"use client";

import { useState, useCallback, useRef } from "react";
import { copyToClipboard } from "@/lib/clipboard";

export function useCopyToClipboard(duration = 2000) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied(true);
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), duration);
      }
      return ok;
    },
    [duration],
  );

  return { copied, copy } as const;
}
