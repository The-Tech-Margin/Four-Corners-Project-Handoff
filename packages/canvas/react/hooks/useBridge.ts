/**
 * @module react/hooks/useBridge
 * Hook for syncing canvas state with an external data store.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CanvasDocument } from '../../core/types';
import { Serializer } from '../../core/Serializer';
import { useCanvasContext } from '../CanvasProvider';
import { useShapes } from './useShapes';

/** Configuration for the bridge between canvas and external store. */
export interface BridgeConfig<TExternal> {
  /** Map canvas state to the external schema. */
  toExternal: (doc: CanvasDocument) => TExternal;
  /** Map external data to canvas state. */
  fromExternal: (data: TExternal) => CanvasDocument;
  /** Called on save with the mapped external data. */
  onSave?: (data: TExternal) => void | Promise<void>;
  /** Whether to automatically save on shape changes. */
  autoSave?: boolean;
  /** Debounce interval in milliseconds for auto-save (default 1000). */
  debounceMs?: number;
}

/** Return type of the {@link useBridge} hook. */
export interface UseBridgeReturn<TExternal> {
  /** Manually trigger a save. */
  sync: () => void;
  /** Load external data into the canvas. */
  load: (data: TExternal) => void;
  /** Whether the canvas has unsaved changes. */
  isDirty: boolean;
  /** Whether an async save is in progress. */
  isSaving: boolean;
  /** Timestamp of the last successful save. */
  lastSaved: Date | null;
}

/**
 * Bridge between the canvas library and an external data model.
 * Handles serialization, deserialization, auto-save with debounce,
 * and dirty tracking.
 *
 * @typeParam TExternal - The shape of the external data model.
 * @param config - Bridge configuration.
 * @returns Bridge control methods and status.
 */
export function useBridge<TExternal>(
  config: BridgeConfig<TExternal>
): UseBridgeReturn<TExternal> {
  const { canvas } = useCanvasContext();
  const { shapes, add, clear } = useShapes();
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const sync = useCallback(() => {
    if (!canvas) return;

    const doc = Serializer.serialize(canvas, shapes);
    const external = configRef.current.toExternal(doc);

    if (configRef.current.onSave) {
      setIsSaving(true);
      const result = configRef.current.onSave(external);
      if (result && typeof result.then === 'function') {
        result
          .then(() => {
            setIsDirty(false);
            setLastSaved(new Date());
          })
          .finally(() => setIsSaving(false));
      } else {
        setIsDirty(false);
        setLastSaved(new Date());
        setIsSaving(false);
      }
    } else {
      setIsDirty(false);
      setLastSaved(new Date());
    }
  }, [canvas, shapes]);

  const load = useCallback(
    (data: TExternal) => {
      const doc = configRef.current.fromExternal(data);
      const { shapes: newShapes } = Serializer.deserialize(doc);
      clear();
      for (const shape of newShapes) {
        add(shape);
      }
      setIsDirty(false);
    },
    [add, clear]
  );

  // Mark dirty on shape changes
  useEffect(() => {
    if (shapes.length > 0) {
      setIsDirty(true);
    }
  }, [shapes]);

  // Auto-save with debounce
  useEffect(() => {
    if (!configRef.current.autoSave || !isDirty) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      sync();
    }, configRef.current.debounceMs ?? 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [isDirty, sync]);

  return { sync, load, isDirty, isSaving, lastSaved };
}
