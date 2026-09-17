/**
 * Editor Shell — dynamically loads the active layout mode renderer.
 *
 * Sits between page.tsx (auth, URL params, project loading) and
 * the mode-specific renderer (scroll, spatial, wizard, voice).
 * Each renderer is code-split via next/dynamic.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import dynamic from "next/dynamic";
import { useFourCornersStore } from "@/lib/store";
import { getLayoutMode } from "@/lib/layout-modes";
import type { EditorProps } from "@/lib/layout-modes";

function EditorSkeleton() {
  return (
    <div className="max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full animate-pulse">
      <div className="h-6 bg-surface-alt rounded w-1/3 mb-4" />
      <div className="h-48 bg-surface-alt rounded mb-6" />
      <div className="space-y-4">
        <div className="h-24 bg-surface-alt rounded" />
        <div className="h-24 bg-surface-alt rounded" />
      </div>
    </div>
  );
}

// Module-level cache of dynamically-loaded mode components, keyed by mode id.
// Lives outside the component so each lookup returns the same reference for
// the same id across renders — that's what makes the inline use safe (no
// component is "created during render"; we look up a stable, pre-built one).
const modeComponentCache = new Map<
  string,
  ReturnType<typeof dynamic<EditorProps>>
>();

function getDynamicMode(modeId: string) {
  const cached = modeComponentCache.get(modeId);
  if (cached) return cached;
  const modeDef = getLayoutMode(modeId);
  const DynamicComponent = dynamic<EditorProps>(() => modeDef.component(), {
    ssr: false,
    loading: () => <EditorSkeleton />,
  });
  modeComponentCache.set(modeId, DynamicComponent);
  return DynamicComponent;
}

export function EditorShell(props: EditorProps) {
  const layoutMode = useFourCornersStore((state) => state.layoutMode);
  const ModeRenderer = getDynamicMode(layoutMode);
  // The lint rule react-hooks/static-components flags any component-typed
  // value used in JSX whose origin can't be statically traced — it can't see
  // through the modeComponentCache Map. Behaviorally, the cache guarantees
  // the same reference for the same modeId, so React will not remount.
  // eslint-disable-next-line react-hooks/static-components
  return <ModeRenderer {...props} />;
}
