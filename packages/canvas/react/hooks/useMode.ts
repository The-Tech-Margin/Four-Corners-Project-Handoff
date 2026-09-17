/**
 * @module react/hooks/useMode
 * Hook for toggling the canvas interaction mode.
 */

import { useState, useCallback } from 'react';
import type { CanvasMode } from '../../core/types';
import { useCanvasContext } from '../CanvasProvider';

/** Return type of the {@link useMode} hook. */
export interface UseModeReturn {
  /** Current canvas mode. */
  mode: CanvasMode;
  /** Set the canvas mode. */
  setMode: (m: CanvasMode) => void;
}

/**
 * Control the canvas interaction mode (edit, view, present).
 * @returns Current mode and setter.
 */
export function useMode(): UseModeReturn {
  const { canvas, mode: contextMode } = useCanvasContext();
  const [mode, setModeState] = useState<CanvasMode>(contextMode);

  const setMode = useCallback(
    (m: CanvasMode) => {
      setModeState(m);
      canvas?.setMode(m);
    },
    [canvas]
  );

  return { mode, setMode };
}
