/**
 * Global image protection.
 *
 * Disables the right-click context menu and native drag on any <img>
 * element anywhere in the app. Pairs with the CSS rules in globals.css
 * (`img { -webkit-user-drag: none; ... }`) — the CSS handles the drag
 * gesture and long-press preview on touch devices, this component
 * intercepts the contextmenu and dragstart events for the keyboard /
 * pointer paths.
 *
 * This is deterrence, not security. A determined viewer can still take
 * a screenshot or pull the URL from DevTools. The goal is to keep
 * casual visitors from "Save image as…" via the default right-click
 * affordance during the private beta.
 *
 * Mounts once at the root layout and renders nothing.
 */

"use client";

import { useEffect } from "react";

export function ImageProtection() {
  useEffect(() => {
    const isImage = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      // Match <img>, <picture> children, and background-image carriers
      // wearing the explicit opt-in class. Keep it tight so other right-
      // click behavior (form fields, links to copy URL) is untouched.
      return (
        target.tagName === "IMG" ||
        target.closest("picture") !== null ||
        target.classList.contains("fc-protect-image")
      );
    };

    const onContextMenu = (e: MouseEvent) => {
      if (isImage(e.target)) e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      if (isImage(e.target)) e.preventDefault();
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  return null;
}
