/**
 * Theme prompt tracking.
 *
 * Logged-in users with no palette preference see a "Do you want to
 * set a custom theme?" prompt up to 3 times. After 3 dismissals the
 * prompt is suppressed permanently.
 *
 * If the user has ever selected a custom theme (even if they later
 * reset to Default), the prompt never appears again.
 */

const DISMISS_KEY = "fc-theme-prompt-dismissed";
const SELECTED_KEY = "fc-theme-prompt-selected";
const MAX_DISMISSALS = 3;

/** True when the prompt should be shown: dismissed < 3 times AND never selected a theme. */
export function shouldShowThemePrompt(): boolean {
  try {
    if (localStorage.getItem(SELECTED_KEY)) return false;
    const count = parseInt(localStorage.getItem(DISMISS_KEY) ?? "0", 10);
    return count < MAX_DISMISSALS;
  } catch {
    return false;
  }
}

/** Increment the dismissal counter. Returns the new count. */
export function recordThemePromptDismissal(): number {
  try {
    const count = parseInt(localStorage.getItem(DISMISS_KEY) ?? "0", 10) + 1;
    localStorage.setItem(DISMISS_KEY, String(count));
    return count;
  } catch {
    return MAX_DISMISSALS;
  }
}

/** Mark that the user has selected a theme. Prompt will never show again. */
export function recordThemeSelection(): void {
  try {
    localStorage.setItem(SELECTED_KEY, "1");
  } catch {
    /* ignore */
  }
}
