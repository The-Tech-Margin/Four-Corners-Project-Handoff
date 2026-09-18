// @fourcorners/canvas — package entry point

// Core engine
export { Canvas } from "./core/Canvas";
export type { CanvasOptions } from "./core/Canvas";
export { ShapeRegistry } from "./core/ShapeRegistry";
export type {
  Point,
  Size,
  Rect,
  ShapeCategory,
  CanvasMode,
  CameraState,
  ShapeJSON,
  ZoneJSON,
  ConnectionJSON,
  CanvasDocument,
  FieldDefinition,
  ValidationResult,
  CanvasRenderContext,
  ThemeTokens,
} from "./core/types";

// Core engine (additional)
export { SnapEngine } from "./core/SnapEngine";
export type { SnapGuide } from "./core/SnapEngine";
export { SelectionManager } from "./core/SelectionManager";
export { HistoryStack } from "./core/HistoryStack";
export type { Command } from "./core/HistoryStack";
export { Serializer } from "./core/Serializer";

// Shapes
export { BaseShape } from "./shapes/BaseShape";
export { PhotoCard } from "./shapes/PhotoCard";
export type { PhotoCardData } from "./shapes/PhotoCard";
export { TextBlock } from "./shapes/TextBlock";
export type { TextBlockData } from "./shapes/TextBlock";
export { ZoneShape } from "./shapes/ZoneShape";
export type { ZoneData } from "./shapes/ZoneShape";
export { VoiceNote } from "./shapes/VoiceNote";
export type { VoiceNoteData } from "./shapes/VoiceNote";
export { LinkCard } from "./shapes/LinkCard";
export type { LinkCardData } from "./shapes/LinkCard";
export { VideoEmbed } from "./shapes/VideoEmbed";
export type { VideoData } from "./shapes/VideoEmbed";

// Media
export { ImageLoader } from "./media/ImageLoader";
export { AudioEngine } from "./media/AudioEngine";
export { LinkPreview } from "./media/LinkPreview";
export type { LinkPreviewData } from "./media/LinkPreview";
export { VideoEngine } from "./media/VideoEngine";

// Mobile
export { TouchManager } from "./mobile/TouchManager";
export { ViewportOptimizer } from "./mobile/ViewportOptimizer";
export { PerformanceMonitor } from "./mobile/PerformanceMonitor";
export { SafeAreaManager } from "./mobile/SafeAreaManager";

// Interactions
export {
  GuidedCapture,
  WITNESS_STEPS,
  DEADLINE_STEPS,
  FIELDWORK_STEPS,
} from "./interactions/GuidedCapture";
export type { CaptureStep } from "./interactions/GuidedCapture";
export { DragDrop } from "./interactions/DragDrop";
export { ContextMenu } from "./interactions/ContextMenu";
export type { ContextMenuItem } from "./interactions/ContextMenu";
export { DoubleTapEdit } from "./interactions/DoubleTapEdit";

// Theme
export { DEFAULT_TOKENS } from "./theme/tokens";
export { ThemeProvider } from "./theme/ThemeProvider";
export { lightTheme } from "./theme/presets/light";
export { darkTheme } from "./theme/presets/dark";
export { fourCornersTheme } from "./theme/presets/fourCorners";
