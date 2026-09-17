/**
 * Centralized Notification System
 *
 * DRY, mobile-first toast notifications with deduplication
 * and consistent messaging across the app.
 *
 * All user-facing messages are centralized here for:
 * - Consistency across the app
 * - Easy translation/i18n preparation
 * - Single source of truth for messaging
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import toast, { type ToastOptions } from "react-hot-toast";
import {
  formatBytes,
  kindLabel,
  type UploadKind,
} from "./upload-limits";

// Track recent notifications to prevent duplicates
const recentNotifications = new Map<string, number>();
const DEDUPE_WINDOW_MS = 2000;

// Mobile-optimized default options
const defaultOptions: ToastOptions = {
  duration: 3000,
  position: "bottom-center",
};

/**
 * Check if a notification was recently shown (deduplication)
 */
function isDuplicate(key: string): boolean {
  const lastShown = recentNotifications.get(key);
  if (lastShown && Date.now() - lastShown < DEDUPE_WINDOW_MS) {
    return true;
  }
  recentNotifications.set(key, Date.now());

  // Cleanup old entries periodically
  if (recentNotifications.size > 50) {
    const now = Date.now();
    for (const [k, v] of recentNotifications.entries()) {
      if (now - v > DEDUPE_WINDOW_MS * 2) {
        recentNotifications.delete(k);
      }
    }
  }

  return false;
}

function getKey(message: string, type: string): string {
  return `${type}:${message.toLowerCase().slice(0, 50)}`;
}

// ============================================
// Message Catalog (i18n-ready)
// All user-facing strings in one place
// ============================================

export const messages = {
  // Authentication
  auth: {
    signedIn: (email: string) => `Signed in as ${email}`,
    signedOut: "Signed out",
    sessionExpired: "Session expired. Please sign in again.",
    pleaseSignIn: "Please sign in to continue",
    accountUpdated: "Account updated",
  },

  // File operations
  file: {
    saved: (name?: string) => name ? `"${name}" saved` : "File saved",
    savedSuccess: "File saved successfully!",
    created: "File created successfully!",
    deleted: (name?: string) => name ? `"${name}" deleted` : "File deleted",
    loaded: (name?: string) => name ? `Loaded "${name}"` : "File loaded",
    notFound: "File not found",
    private: "This file is private",
    nameTaken: (name: string) => `"${name}" already exists`,
    nameRequired: "Please enter a file name",
    nameUpdated: "Name updated",
    nameUpdateFailed: "Failed to update name",
    tooLarge: (
      fileName: string,
      actualBytes: number,
      limitBytes: number,
      kind: UploadKind,
    ) =>
      `${fileName} is ${formatBytes(actualBytes)} — ${kindLabel(kind)}s must be under ${formatBytes(limitBytes)}.`,
    quotaExceeded: (usedBytes: number, limitBytes: number, plan: string) =>
      `You've used ${formatBytes(usedBytes)} of your ${formatBytes(limitBytes)} storage (${plan} plan). Remove some assets or upgrade to add more.`,
    invalidType: (name: string) => `"${name}" is not a valid file type`,
    uploadFailed: "Upload failed. Please try again.",
    uploadsIncomplete: (count: number, names: string[]) => {
      const shown = names.slice(0, 3).join(", ");
      const extra = names.length > 3 ? ` +${names.length - 3} more` : "";
      const noun = count === 1 ? "file" : "files";
      return `${count} ${noun} didn't finish uploading (${shown}${extra}). Your edits were saved — save again to retry.`;
    },
    restored: "Your work has been restored",
    cleared: "All data cleared",
    linkedCreated: "Linked file created",
    duplicateFailed: "No project to duplicate",
  },

  // Save operations
  save: {
    failed: (error: string) => `Failed to save: ${error}`,
    createFailed: (error: string) => `Failed to create: ${error}`,
  },

  // Clipboard
  clipboard: {
    copied: "Copied to clipboard",
    linkCopied: "Link copied",
    failed: "Could not copy to clipboard",
  },

  // Publishing & sharing
  publish: {
    published: "File published",
    unpublished: "File unpublished",
    addedToGallery: "Added to gallery",
    removedFromGallery: "Removed from gallery",
    failed: "Failed to update visibility",
    limitReached:
      "Gallery limit reached — remove a project from the gallery to publish this one.",
  },

  share: {
    projectIdMissing: "Cannot share: Project ID missing",
    signInRequired: "Please sign in to share your file",
    nameRequired: "Please name your file to share it",
    prepareFailed: "Could not prepare file for sharing",
    savedButShareFailed: "File saved but could not prepare for sharing",
    copyFailed: "Failed to copy project. Please try again.",
  },

  // Export
  export: {
    preparing: "Preparing export...",
    ready: "Export ready",
    failed: "Export failed. Please try again.",
    prepareFailed: "Failed to prepare export. Please try again.",
    notReady: "Export assets not ready. Please try again.",
    zipFailed: "Failed to generate ZIP export. Please try again.",
  },

  // Import
  import: {
    cancelled: "Import cancelled",
  },

  // Voice/transcription
  voice: {
    transcribeFailed: "Failed to transcribe. Please try again.",
    micPermissionDenied:
      "Microphone permission denied. Please allow access in your browser settings.",
    micUnavailable:
      "Could not access microphone. Check that no other app is using it.",
    requiresHttps: "Audio recording requires a secure (HTTPS) connection.",
    uploadingLargeFile: "Uploading large audio file...",
    fileTooLarge: (maxMB: number) =>
      `Audio file exceeds ${maxMB}MB limit. Try a shorter recording or compress the file.`,
    transcribing: "Transcribing audio...",
    transcribeSuccess: "Audio transcribed successfully",
    soundscapeDetected: "No speech detected — described as a soundscape.",
    emptyAudio: "No speech or sounds detected in the recording.",
  },

  // Configuration
  config: {
  },

  // Generic
  generic: {
    success: "Success",
    error: "Something went wrong",
    loading: "Loading...",
    saved: "Saved",
    updated: "Updated",
    deleted: "Deleted",
  },
} as const;

// ============================================
// Core notification methods
// ============================================

export const notify = {
  /**
   * Success notification (green)
   */
  success(message: string, options?: ToastOptions) {
    const key = getKey(message, "success");
    if (isDuplicate(key)) return;
    return toast.success(message, { ...defaultOptions, ...options });
  },

  /**
   * Error notification (red, shows longer)
   */
  error(message: string, options?: ToastOptions) {
    const key = getKey(message, "error");
    if (isDuplicate(key)) return;
    return toast.error(message, {
      ...defaultOptions,
      duration: 4000,
      ...options,
    });
  },

  /**
   * Loading notification (spinner)
   */
  loading(message: string, options?: ToastOptions) {
    return toast.loading(message, { ...defaultOptions, ...options });
  },

  /**
   * Info/neutral notification
   */
  info(message: string, options?: ToastOptions) {
    const key = getKey(message, "info");
    if (isDuplicate(key)) return;
    return toast(message, { ...defaultOptions, ...options });
  },

  /**
   * Dismiss toast(s)
   */
  dismiss(toastId?: string) {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  },

  /**
   * Promise-based toast (loading -> success/error)
   */
  promise<T>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: Error) => string);
    },
    options?: ToastOptions,
  ) {
    return toast.promise(promise, msgs, { ...defaultOptions, ...options });
  },
};

// ============================================
// Domain-specific notification helpers
// These use centralized messages for consistency
// ============================================

export const notifyAuth = {
  signedIn(email: string) {
    notify.success(messages.auth.signedIn(email));
  },
  signedOut() {
    notify.info(messages.auth.signedOut);
  },
  pleaseSignIn() {
    notify.error(messages.auth.pleaseSignIn);
  },
  sessionExpired() {
    notify.error(messages.auth.sessionExpired);
  },
  accountUpdated() {
    notify.info(messages.auth.accountUpdated);
  },
};

export const notifyFile = {
  saved(name?: string) {
    notify.success(messages.file.saved(name));
  },
  savedSuccess() {
    notify.success(messages.file.savedSuccess);
  },
  created() {
    notify.success(messages.file.created);
  },
  deleted(name?: string) {
    notify.success(messages.file.deleted(name));
  },
  loaded(name?: string) {
    notify.success(messages.file.loaded(name));
  },
  notFound() {
    notify.error(messages.file.notFound);
  },
  private() {
    notify.error(messages.file.private);
  },
  nameRequired() {
    notify.error(messages.file.nameRequired);
  },
  nameUpdated() {
    notify.success(messages.file.nameUpdated);
  },
  nameUpdateFailed() {
    notify.error(messages.file.nameUpdateFailed);
  },
  nameTaken(name: string) {
    notify.error(messages.file.nameTaken(name));
  },
  tooLarge(
    fileName: string,
    actualBytes: number,
    limitBytes: number,
    kind: UploadKind,
  ) {
    notify.error(messages.file.tooLarge(fileName, actualBytes, limitBytes, kind));
  },
  quotaExceeded(usedBytes: number, limitBytes: number, plan: string) {
    notify.error(messages.file.quotaExceeded(usedBytes, limitBytes, plan));
  },
  invalidType(name: string) {
    notify.error(messages.file.invalidType(name));
  },
  uploadFailed() {
    notify.error(messages.file.uploadFailed);
  },
  uploadsIncomplete(names: string[]) {
    if (names.length === 0) return;
    notify.error(messages.file.uploadsIncomplete(names.length, names), {
      duration: 10000,
    });
  },
  restored() {
    notify.success(messages.file.restored);
  },
  cleared() {
    notify.info(messages.file.cleared);
  },
  linkedCreated() {
    notify.success(messages.file.linkedCreated);
  },
  duplicateFailed() {
    notify.error(messages.file.duplicateFailed);
  },
};

export const notifySave = {
  failed(error: string) {
    notify.error(messages.save.failed(error));
  },
  createFailed(error: string) {
    notify.error(messages.save.createFailed(error));
  },
};

export const notifyClipboard = {
  copied() {
    notify.success(messages.clipboard.copied);
  },
  linkCopied() {
    notify.success(messages.clipboard.linkCopied);
  },
  failed() {
    notify.error(messages.clipboard.failed);
  },
};

export const notifyPublish = {
  published() {
    notify.success(messages.publish.published);
  },
  unpublished() {
    notify.success(messages.publish.unpublished);
  },
  addedToGallery() {
    notify.success(messages.publish.addedToGallery);
  },
  removedFromGallery() {
    notify.success(messages.publish.removedFromGallery);
  },
  failed(error?: string) {
    notify.error(error || messages.publish.failed);
  },
  limitReached() {
    notify.error(messages.publish.limitReached, { duration: 12000 });
  },
};

export const notifyShare = {
  projectIdMissing() {
    notify.error(messages.share.projectIdMissing);
  },
  signInRequired() {
    notify.info(messages.share.signInRequired);
  },
  nameRequired() {
    notify.info(messages.share.nameRequired);
  },
  prepareFailed() {
    notify.error(messages.share.prepareFailed);
  },
  savedButShareFailed() {
    notify.error(messages.share.savedButShareFailed);
  },
  copyFailed() {
    notify.error(messages.share.copyFailed);
  },
};

export const notifyExport = {
  preparing() {
    return notify.loading(messages.export.preparing);
  },
  ready() {
    notify.success(messages.export.ready);
  },
  failed() {
    notify.error(messages.export.failed);
  },
  prepareFailed() {
    notify.error(messages.export.prepareFailed);
  },
  notReady() {
    notify.error(messages.export.notReady);
  },
  zipFailed() {
    notify.error(messages.export.zipFailed);
  },
};

export const notifyImport = {
  cancelled() {
    notify.info(messages.import.cancelled);
  },
};

export const notifyVoice = {
  transcribeFailed() {
    notify.error(messages.voice.transcribeFailed);
  },
  micPermissionDenied() {
    notify.error(messages.voice.micPermissionDenied);
  },
  micUnavailable() {
    notify.error(messages.voice.micUnavailable);
  },
  requiresHttps() {
    notify.error(messages.voice.requiresHttps);
  },
  uploadingLargeFile() {
    return notify.loading(messages.voice.uploadingLargeFile);
  },
  fileTooLarge(maxMB: number) {
    notify.error(messages.voice.fileTooLarge(maxMB));
  },
  transcribing() {
    return notify.loading(messages.voice.transcribing);
  },
  transcribeSuccess() {
    notify.success(messages.voice.transcribeSuccess);
  },
  soundscapeDetected() {
    notify.info(messages.voice.soundscapeDetected);
  },
  emptyAudio() {
    notify.info(messages.voice.emptyAudio);
  },
};

export const notifyConfig = {
};

// Default export for simple usage
export default notify;
