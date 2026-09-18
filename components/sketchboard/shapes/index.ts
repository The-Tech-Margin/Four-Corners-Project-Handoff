/**
 * Shape registrations for @fourcorners/canvas.
 * Built-in shapes must be explicitly registered with ShapeRegistry.
 */

import {
  ShapeRegistry,
  TextBlock,
  PhotoCard,
  VoiceNote,
  LinkCard,
  ZoneShape,
} from "@fourcorners/canvas";

// Register built-in shapes
if (!ShapeRegistry.get("text-block")) ShapeRegistry.register(TextBlock);
if (!ShapeRegistry.get("photo-card")) ShapeRegistry.register(PhotoCard);
if (!ShapeRegistry.get("voice-note")) ShapeRegistry.register(VoiceNote);
if (!ShapeRegistry.get("link-card")) ShapeRegistry.register(LinkCard);
if (!ShapeRegistry.get("zone")) ShapeRegistry.register(ZoneShape);

// Side-effect import: registers ContextItemShape with ShapeRegistry
import "./ContextItemShape";

export { ContextItemShape } from "./ContextItemShape";
export type { ContextItemData } from "./ContextItemShape";
