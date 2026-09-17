/**
 * Four Corners Photo Viewer Components
 *
 * Native React implementation of Fred Ritchin's Four Corners concept,
 * replicating the exact UX from fourcorners.js with your theme system.
 */

// Main viewer component
export { FCPhotoViewer } from "./fc-photo-viewer";
export type { FCPhotoViewerProps, FCPhotoViewerData } from "./fc-photo-viewer";

// Sub-components (for advanced customization)
export { FCCorner } from "./fc-corner";
export type { FCCornerProps } from "./fc-corner";

export { FCPanel } from "./fc-panel";
export type { FCPanelProps } from "./fc-panel";

// Panel content components
export { FCPanelAuthorship } from "./fc-panel-authorship";
export type { FCPanelAuthorshipProps, AuthorshipData } from "./fc-panel-authorship";

export { FCPanelBackstory } from "./fc-panel-backstory";
export type { FCPanelBackstoryProps } from "./fc-panel-backstory";

export { FCPanelImagery } from "./fc-panel-imagery";
export type { FCPanelImageryProps } from "./fc-panel-imagery";

export { FCPanelLinks } from "./fc-panel-links";
export type { FCPanelLinksProps } from "./fc-panel-links";

// State hook
export { useFCViewer } from "./use-fc-viewer";
export type { FCCornerKey, FCViewerState, FCViewerActions } from "./use-fc-viewer";
