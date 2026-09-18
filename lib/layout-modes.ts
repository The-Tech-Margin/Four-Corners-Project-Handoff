/**
 * Layout Mode Registry
 *
 * Each layout mode defines a different UI paradigm for inputting
 * Four Corners metadata. Modes are orthogonal to data modes
 * (minimal/standard/complete) — every combination is valid.
 *
 * Modes are code-split via dynamic imports so users only download
 * the renderer they're using.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import type { ComponentType } from "react";
import type { AutosaveStatus } from "@/hooks/useAutosave";

export interface EditorProps {
  isLoggedIn: boolean;
  isReadOnly: boolean;
  dataMode: "minimal" | "standard" | "complete";
  sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>>;
  onExport: () => void;
  onImport: () => void;
  onCornerClick: (sectionId: string) => void;
  viewingSharedProject: boolean;
  autosaveStatus: AutosaveStatus;
  lastAutosaveError: string | null;
  /** Publish/gallery state managed by page shell */
  isPublished: boolean;
  inGallery: boolean;
  onPublishToggle: (published: boolean) => void;
  onGalleryToggle: (inGallery: boolean) => void;
}

export interface LayoutModeDefinition {
  id: string;
  label: string;
  description: string;
  /** Lucide icon name for the selector UI */
  icon: string;
  /** Dynamic import for code-splitting */
  component: () => Promise<{ default: ComponentType<EditorProps> }>;
  /** Which data modes this layout supports (empty = all) */
  supportedDataModes: ("minimal" | "standard" | "complete")[];
  /** Requires authentication to use */
  requiresAuth?: boolean;
}

/**
 * Registry of all available layout modes.
 * To add a new mode: push a definition here and create
 * the corresponding component in components/modes/.
 */
export const LAYOUT_MODES: LayoutModeDefinition[] = [
  {
    id: "scroll",
    label: "Scroll",
    description: "Classic vertical editor",
    icon: "List",
    component: () => import("@/components/modes/scroll-mode"),
    supportedDataModes: ["minimal", "standard", "complete"],
  },
  {
    id: "sketchboard",
    label: "Sketchboard",
    description: "Visual canvas editor",
    icon: "PenTool",
    // Stub — sketchboard renders directly in page.tsx, not via EditorShell
    component: () => import("@/components/modes/scroll-mode"),
    supportedDataModes: ["minimal", "standard", "complete"],
  },
];

/** Lookup a mode definition by id, falling back to scroll */
export function getLayoutMode(id: string): LayoutModeDefinition {
  return LAYOUT_MODES.find((m) => m.id === id) ?? LAYOUT_MODES[0];
}

/** Get modes available for a given data mode */
export function getAvailableLayoutModes(
  dataMode: "minimal" | "standard" | "complete",
): LayoutModeDefinition[] {
  return LAYOUT_MODES.filter(
    (m) =>
      m.supportedDataModes.length === 0 ||
      m.supportedDataModes.includes(dataMode),
  );
}
