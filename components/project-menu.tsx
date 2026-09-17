"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFourCornersStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { useAccess } from "./access-provider";
import {
  togglePublish,
  toggleGallery,
  GALLERY_LIMIT_REACHED,
} from "@/lib/db/projects";
import { useProjectMetadata } from "@/hooks/useProjectMetadata";
import { useProjectSave } from "@/hooks/useProjectSave";
import { AuthModal } from "./auth-modal";
import { SlugInputModal } from "./slug-input-modal";
import { ProjectPickerModal } from "./project-picker-modal";
import { ConfirmDialog } from "./confirm-dialog";
import { MessageDialog } from "./message-dialog";
import { ModeSelector } from "./mode-selector";
import { ShareModal } from "./share-modal";
import { ThemeToggle } from "./theme-toggle";
import { StorageUsageBadge } from "./storage-usage-badge";
import type { ProjectRecord } from "@/lib/db/projects";
import {
  notify,
  notifyPublish,
  notifyFile,
  notifySave,
  notifyShare,
} from "@/lib/notify";
import { encodeProjectId } from "@/lib/encode-id";
import { Grid2X2, Palette } from "lucide-react";
import { PalettePickerModal } from "./palette-picker-modal";
import {
  shouldShowThemePrompt,
  recordThemePromptDismissal,
} from "@/lib/theme-prompt";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+/, "");
}

interface ProjectMenuProps {
  onImportClick: () => void;
  onExportClick?: () => void;
  onClearAll?: () => void;
  isPublished?: boolean;
  onPublishToggle?: (published: boolean) => void;
  inGallery?: boolean;
  onGalleryToggle?: (inGallery: boolean) => void;
  /** Show theme toggle inside the menu (for mobile) */
  showThemeToggle?: boolean;
  /** True when rendered from the editor page — shows editor-only actions */
  isEditor?: boolean;
  /** View page specific actions */
  viewActions?: {
    onShare?: () => void;
    onEdit?: () => void;
    onDownloadJSON?: () => void;
    onDownloadIIIF?: () => void;
    isOwnProject?: boolean;
  };
}

/** Focusable elements inside the menu panel (for focus management + arrow nav). */
const MENU_FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ProjectMenu({
  onImportClick: _onImportClick,
  onExportClick: _onExportClick,
  onClearAll: _onClearAll,
  isPublished = false,
  onPublishToggle,
  inGallery = false,
  onGalleryToggle,
  showThemeToggle = false,
  isEditor = false,
  viewActions,
}: ProjectMenuProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isOpen, setIsOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [_authContext, setAuthContext] = useState<"newProject" | "load">(
    "newProject",
  );
  const [showSlugInput, setShowSlugInput] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  // Auth + admin state come from the single app-wide AccessProvider — no
  // per-component subscription or module cache. The provider keeps prior state
  // on 429/5xx, so the Admin item never flickers out on a rate-limited check.
  const { user, authLoading, isAdmin, pendingInvites, refreshAccess } =
    useAccess();
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareAfterSave, setShareAfterSave] = useState(false);
  const [showPaletteModal, setShowPaletteModal] = useState(false);
  const [themePromptActive, setThemePromptActive] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const projectId = useFourCornersStore((state) => state.projectId);
  const projectSlug = useFourCornersStore((state) => state.projectSlug);
  const pendingSlug = useFourCornersStore((state) => state.pendingSlug);
  const pendingTitle = useFourCornersStore((state) => state.pendingTitle);
  const { buildMetadata } = useProjectMetadata();
  const { saving, saveStatus, save, createNew, checkAuth } = useProjectSave();

  // Refresh the admin signal each time the menu opens so the pending-invite
  // dot reflects the current count rather than the count at mount. Auth +
  // admin tracking itself lives in the AccessProvider.
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    refreshAccess();
  }, [isOpen, user?.id, refreshAccess]);

  // Open the palette modal when the help launcher requests it.
  useEffect(() => {
    const onOpenPalette = () => {
      setShowPaletteModal(true);
      setThemePromptActive(false);
    };
    window.addEventListener("fc:open-palette", onOpenPalette);
    return () => window.removeEventListener("fc:open-palette", onOpenPalette);
  }, []);

  // Show palette prompt for logged-in users with no preference (up to 3 times)
  useEffect(() => {
    if (!user) return;

    function handleNoPalette() {
      if (shouldShowThemePrompt()) {
        setShowPaletteModal(true);
        setThemePromptActive(true);
      }
    }

    // Check flag in case PersonaProvider dispatched before this listener registered
    if ((window as unknown as Record<string, unknown>).__fcNoPalettePreference) {
      handleNoPalette();
      delete (window as unknown as Record<string, unknown>).__fcNoPalettePreference;
    }

    window.addEventListener("fc:no-palette-preference", handleNoPalette);
    return () => window.removeEventListener("fc:no-palette-preference", handleNoPalette);
  }, [user]);

  // Dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "default" | "danger";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const [messageDialog, setMessageDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: "info" | "success" | "error";
  }>({ isOpen: false, title: "", message: "", variant: "info" });

  const hasUnsavedChanges = useFourCornersStore(
    (state) => state.hasUnsavedChanges,
  );
  const imageSrc = useFourCornersStore((state) => state.imageSrc);
  const setProjectId = useFourCornersStore((state) => state.setProjectId);
  const markSaved = useFourCornersStore((state) => state.markSaved);
  const reset = useFourCornersStore((state) => state.reset);
  const importMetadata = useFourCornersStore((state) => state.importMetadata);

  const handleNewProject = async () => {
    const proceedWithNewProject = async () => {
      // Reset the current state
      reset();
      setIsOpen(false);

      // Navigate to the editor if not already there
      if (window.location.pathname !== "/") {
        router.push("/?new=true");
        return;
      }

      // Check if user is authenticated
      if (!supabase) {
        return;
      }

      let isAuthenticated = false;
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        isAuthenticated = !!u;
      } catch {
        // getUser() network failure — fallback to cached session
        try {
          const { data: { session } } = await supabase.auth.getSession();
          isAuthenticated = !!session?.user;
        } catch { /* ignore */ }
      }

      if (!isAuthenticated) {
        // Not authenticated - directly show auth modal
        setAuthContext("newProject");
        setShowAuth(true);
      } else {
        // Authenticated - show slug input to create new file
        setShowSlugInput(true);
      }
    };

    if (hasUnsavedChanges) {
      setConfirmDialog({
        isOpen: true,
        title: "Unsaved Changes",
        message: "You have unsaved changes. Start a new file anyway?",
        onConfirm: proceedWithNewProject,
        variant: "danger",
      });
    } else {
      await proceedWithNewProject();
    }
  };

  const handleSave = async () => {
    const metadata = buildMetadata();
    const result = await save(metadata);

    if (result.error) {
      setMessageDialog({
        isOpen: true,
        title: "Save Failed",
        message: result.error,
        variant: "error",
      });
    } else if (result.requiresAuth) {
      setShowAuth(true);
    } else if (result.requiresSlug) {
      // Use an existing slug if available (derived from title or previously saved)
      const existingSlug = pendingSlug?.trim() || projectSlug?.trim();
      const existingTitle = pendingTitle?.trim();
      if (existingSlug) {
        const userId = await checkAuth();
        if (!userId) return;
        // Include title in metadata
        if (existingTitle) {
          (metadata as Record<string, unknown>).title = existingTitle;
        }
        const createResult = await createNew(
          metadata,
          userId,
          existingSlug,
          existingTitle,
        );
        if (createResult.success) {
          if (existingTitle) {
            useFourCornersStore.setState({ projectTitle: existingTitle });
          }
          setIsOpen(false);
        } else if (createResult.error) {
          setMessageDialog({
            isOpen: true,
            title: "Create Failed",
            message: createResult.error,
            variant: "error",
          });
        }
      } else {
        // Only show modal if no title/slug has been entered yet
        setShowSlugInput(true);
      }
    } else if (result.success) {
      setIsOpen(false);
    }
  };

  const handleCreateProject = async () => {
    const userId = await checkAuth();
    if (!userId) return;

    if (!titleInput.trim()) {
      setMessageDialog({
        isOpen: true,
        title: "Title Required",
        message: "Please enter a project title",
        variant: "error",
      });
      return;
    }

    const title = titleInput.trim();
    const slug = slugify(title);

    if (!slug) {
      setMessageDialog({
        isOpen: true,
        title: "Invalid Title",
        message: "Title must contain at least one letter or number",
        variant: "error",
      });
      return;
    }

    const metadata = buildMetadata();
    const result = await createNew(metadata, userId, slug, title);

    if (result.success) {
      // Store the title
      useFourCornersStore.setState({ projectTitle: title });
      setShowSlugInput(false);
      setTitleInput("");
      setIsOpen(false);

      // If user was trying to share, auto-open share modal after successful save
      if (shareAfterSave) {
        setShareAfterSave(false);
        try {
          // Auto-publish before sharing
          const newProjectId = useFourCornersStore.getState().projectId;
          if (newProjectId) {
            await togglePublish(newProjectId, true);
            if (onPublishToggle) onPublishToggle(true);
            setShowShareModal(true);
          }
        } catch (error) {
          console.error("Failed to prepare file for sharing:", error);
          notifyShare.savedButShareFailed();
        }
      }
    } else if (result.error) {
      setMessageDialog({
        isOpen: true,
        title: "Create Failed",
        message: result.error,
        variant: "error",
      });
    }
  };

  const handleSelectProject = async (project: ProjectRecord) => {
    // Ensure ID is a string (not Buffer or binary)
    const projectIdString = String(project.id);
    const projectSlugString = project.slug ? String(project.slug) : "";

    importMetadata(project.metadata);
    setProjectId(projectIdString, projectSlugString, project.title ?? undefined);
    markSaved();

    if (project.main_image_url) {
      // Use setState rather than setImageSrc so we can also seed
      // mainImageStoragePath from the DB row — setImageSrc clears it,
      // which would break the subsequent save for gallery-picked images.
      useFourCornersStore.setState({
        imageSrc: project.main_image_url,
        mainImageStoragePath: project.main_image_storage_path ?? null,
      });
    }

    setShowLoadModal(false);
  };


  const handleLogin = () => {
    setIsOpen(false);
    setAuthContext("newProject");
    setShowAuth(true);
  };

  const handleShare = async () => {
    // Check if user is logged in first
    if (!user) {
      setIsOpen(false);
      setAuthContext("newProject");
      setShowAuth(true);
      notifyShare.signInRequired();
      return;
    }

    // If project not saved yet, save it first
    if (!projectId || !projectSlug) {
      const existingTitle = pendingTitle?.trim();
      const existingSlug = existingTitle ? slugify(existingTitle) : (pendingSlug?.trim() || projectSlug?.trim());
      if (existingSlug) {
        // Auto-create with existing name instead of prompting
        const userId = await checkAuth();
        if (!userId) return;
        const metadata = buildMetadata();
        const createResult = await createNew(
          metadata,
          userId,
          existingSlug,
          existingTitle,
        );
        if (!createResult.success) {
          setIsOpen(false);
          if (createResult.error) {
            notifySave.createFailed(createResult.error);
          }
          return;
        }
        if (existingTitle) {
          useFourCornersStore.setState({ projectTitle: existingTitle });
        }
        // Fall through to share logic below
      } else {
        setIsOpen(false);
        setShareAfterSave(true);
        setShowSlugInput(true);
        notifyShare.nameRequired();
        return;
      }
    }

    try {
      // Re-read from store — projectId may have just been set by createNew above
      const currentProjectId = useFourCornersStore.getState().projectId;
      if (!currentProjectId) return;

      // Auto-save if there are unsaved changes before sharing
      if (hasUnsavedChanges) {
        const metadata = buildMetadata();
        const saveResult = await save(metadata);
        if (saveResult.error) {
          console.error("Auto-save before share failed:", saveResult.error);
          notifyShare.savedButShareFailed();
          return;
        }
      }

      // Auto-publish before sharing
      await togglePublish(currentProjectId, true);
      if (onPublishToggle) onPublishToggle(true);
      setIsOpen(false);
      setShowShareModal(true);
    } catch (error) {
      console.error("Failed to prepare file for sharing:", error);
      notifyShare.prepareFailed();
    }
  };

  const handleTogglePublish = async () => {
    if (!projectId) return;

    try {
      const newPublishedState = !isPublished;
      await togglePublish(projectId, newPublishedState);

      if (newPublishedState) {
        notifyPublish.published();
      } else {
        notifyPublish.unpublished();
      }
      setIsOpen(false);

      if (onPublishToggle) onPublishToggle(newPublishedState);

      // If unpublishing, also remove from gallery
      if (!newPublishedState && inGallery && onGalleryToggle) {
        await toggleGallery(projectId, false);
        onGalleryToggle(false);
      }
    } catch (error) {
      console.error("Failed to toggle publish:", error);
      notifyPublish.failed(error instanceof Error ? error.message : "Failed to toggle publish");
    }
  };

  const handleToggleGallery = async () => {
    // If project not saved yet, save it first
    if (!projectId || !projectSlug) {
      const existingTitle = pendingTitle?.trim();
      const existingSlug = existingTitle ? slugify(existingTitle) : (pendingSlug?.trim() || projectSlug?.trim());
      if (existingSlug) {
        const userId = await checkAuth();
        if (!userId) return;
        const metadata = buildMetadata();
        const createResult = await createNew(
          metadata,
          userId,
          existingSlug,
          existingTitle,
        );
        if (!createResult.success) {
          setIsOpen(false);
          if (createResult.error) {
            notifySave.createFailed(createResult.error);
          }
          return;
        }
        if (existingTitle) {
          useFourCornersStore.setState({ projectTitle: existingTitle });
        }
        // Fall through to gallery toggle below
      } else {
        setIsOpen(false);
        setShowSlugInput(true);
        notify.info("Save your file first to add it to the gallery");
        return;
      }
    }

    try {
      // Re-read from store — projectId may have just been set by createNew above
      const currentProjectId = useFourCornersStore.getState().projectId;
      if (!currentProjectId) return;

      const newGalleryState = !inGallery;

      // Auto-publish if adding to gallery and not yet published
      if (newGalleryState && !isPublished) {
        await togglePublish(currentProjectId, true);
        if (onPublishToggle) onPublishToggle(true);
      }

      await toggleGallery(currentProjectId, newGalleryState);

      if (newGalleryState) {
        notifyPublish.addedToGallery();
      } else {
        notifyPublish.removedFromGallery();
      }
      setIsOpen(false);

      if (onGalleryToggle) onGalleryToggle(newGalleryState);
    } catch (error) {
      console.error("Failed to toggle gallery:", error);
      if (error instanceof Error && error.message === GALLERY_LIMIT_REACHED) {
        notifyPublish.limitReached();
        return;
      }
      notifyPublish.failed(error instanceof Error ? error.message : "Failed to toggle gallery");
    }
  };

  const handleDuplicate = async () => {
    if (!projectId) {
      notifyFile.duplicateFailed();
      return;
    }

    setIsOpen(false);

    try {
      const response = await fetch(`/api/projects/${projectId}/duplicate`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to duplicate project");
      }

      const data = await response.json();

      notify.success(
        data.isFork
          ? `Forked (Version ${data.version})`
          : `Duplicated (Version ${data.version})`,
      );

      // Load the new duplicate
      if (data.project) {
        importMetadata(data.project.metadata);
        setProjectId(
          data.project.id,
          data.project.slug || "",
          data.project.title ?? undefined,
        );
        markSaved();

        if (data.project.main_image_url) {
          useFourCornersStore.setState({
            imageSrc: data.project.main_image_url,
            mainImageStoragePath:
              data.project.main_image_storage_path ?? null,
          });
        }

        // Optionally navigate to the new project
        if (data.project.slug) {
          router.push(`/?file=${encodeProjectId(data.project.id)}`);
        }
      }
    } catch (error) {
      console.error("Failed to duplicate project:", error);
      notifyShare.copyFailed();
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // The AccessProvider clears the user on SIGNED_OUT.
    setIsOpen(false);
    // Reset project state on logout
    reset();
    router.push("/");
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll on mobile when menu is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Keyboard a11y: move focus into the menu on open and restore it to the
  // trigger on close. The body runs only while open, so it never steals focus
  // on mount.
  useEffect(() => {
    if (!isOpen) return;
    // Focus the panel container (stable across inner re-renders from the
    // admin-role / pending-invite fetches); arrow/Tab then move to the items.
    const trigger = triggerRef.current;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      trigger?.focus();
    };
  }, [isOpen]);

  // Arrow / Home / End navigation between menu items, plus a Tab focus-trap.
  // Native form fields (range sliders, selects) keep their own arrow behavior.
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    const active = document.activeElement as HTMLElement | null;
    const onFormField =
      !!active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName);
    const items = Array.from(
      panel.querySelectorAll<HTMLElement>(MENU_FOCUSABLE),
    ).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const idx = active ? items.indexOf(active) : -1;
    const focusAt = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown" && !onFormField) focusAt(idx + 1);
    else if (e.key === "ArrowUp" && !onFormField) focusAt(idx - 1);
    else if (e.key === "Home" && !onFormField) focusAt(0);
    else if (e.key === "End" && !onFormField) focusAt(items.length - 1);
    else if (e.key === "Tab") {
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          ref={triggerRef}
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 p-2.5 bg-surface hover:bg-surface-alt rounded-lg transition-all active:scale-95 touch-manipulation"
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-controls="project-menu-panel"
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          <Grid2X2 className="w-5 h-5 transition-transform duration-200" style={{ color: "var(--fc-corner-links)" }} />
          <span className="hidden sm:inline text-xs sm:text-sm font-medium" style={{ color: "var(--fc-text-secondary)" }}>
            Menu
          </span>
        </button>

        {/* Backdrop overlay for mobile */}
        {isOpen && (
          <div
            className="fixed inset-0 top-14 sm:top-16 bg-black/40 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
        )}

        {/* Menu dropdown */}
        {isOpen && (
          <div
            ref={panelRef}
            id="project-menu-panel"
            aria-label="Main menu"
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
            className="fixed md:absolute left-0 right-0 md:left-auto md:right-0 top-14 sm:top-16 md:top-full mt-0 md:mt-2 w-auto md:w-72 lg:w-80 max-h-[calc(100dvh-3.5rem)] sm:max-h-[calc(100dvh-4rem)] md:max-h-[85vh] overflow-y-auto menu-dropdown border-t md:border border-border md:rounded-xl shadow-2xl py-2 z-40 md:z-[60] animate-in slide-in-from-top-2 fade-in duration-200">
            {/* User Info / Auth */}
            {authLoading ? (
              <div className="px-5 py-4 border-b border-border/50 menu-section-header">
                <div className="flex items-center justify-center py-2">
                  <svg
                    className="animate-spin h-5 w-5 text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="ml-2 text-sm menu-item-secondary">
                    Loading...
                  </span>
                </div>
              </div>
            ) : user ? (
              <div className="px-5 py-4 border-b border-border/50 menu-section-header">
                <div className="text-xs menu-item-secondary mb-1.5 font-medium">
                  Signed in as
                </div>
                <div className="text-sm menu-item-text font-medium truncate mb-3">
                  {user.email}
                </div>
                {/* Storage usage — quick at-a-glance quota on the primary
                    logged-in surface. Menu stays open a moment so users can
                    read the number without chasing it. */}
                <StorageUsageBadge className="w-full mb-3" />
                <button
                  onClick={handleLogout}
                  className="w-full text-sm px-4 py-3 rounded-lg transition-all active:scale-95 font-semibold shadow-sm touch-manipulation min-h-[44px]"
                  style={{ background: "var(--fc-accent)", color: "var(--fc-accent-on)" }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="px-5 py-4 border-b border-border/50 menu-section-header">
                <button
                  onClick={handleLogin}
                  className="w-full text-sm px-4 py-3 rounded-lg transition-all active:scale-95 font-semibold shadow-sm touch-manipulation min-h-[44px]"
                  style={{ background: "var(--fc-accent)", color: "var(--fc-accent-on)" }}
                >
                  Sign In
                </button>
                <p className="text-xs menu-item-secondary mt-2.5 text-center">
                  Sign in to save files
                </p>
              </div>
            )}

            {/* View page actions - shown when viewing a file */}
            {viewActions && (
              <>
                <div className="border-t border-border/50 my-2" />
                <div className="px-5 py-2">
                  <div className="text-xs menu-item-secondary mb-2 font-medium">
                    This File
                  </div>
                </div>

                {/* Share */}
                {viewActions.onShare && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      viewActions.onShare?.();
                    }}
                    className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                    Share
                  </button>
                )}

                {/* Edit - only for own projects */}
                {viewActions.isOwnProject && viewActions.onEdit && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      viewActions.onEdit?.();
                    }}
                    className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit File
                  </button>
                )}

                {/* Download JSON - only for own projects */}
                {viewActions.isOwnProject && viewActions.onDownloadJSON && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      viewActions.onDownloadJSON?.();
                    }}
                    className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download JSON
                  </button>
                )}

                {/* Download IIIF - only for own projects */}
                {viewActions.isOwnProject && viewActions.onDownloadIIIF && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      viewActions.onDownloadIIIF?.();
                    }}
                    className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download IIIF Manifest
                  </button>
                )}
              </>
            )}

            {/* Auth-required options - only show when logged in and not loading */}
            {!authLoading && user && (
              <>
                {/* New Project */}
                <button
                  onClick={handleNewProject}
                  className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  New File
                </button>

                {/* Save - editor only */}
                {isEditor && (
                  <button
                    onClick={handleSave}
                    disabled={saving || !imageSrc}
                    className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                      />
                    </svg>
                    Save to Cloud
                  </button>
                )}

                {/* Canvas editor is hidden from the menu during private beta.
                    The sketchboard mode still exists in code (and any user
                    whose persisted state is "sketchboard" can exit via the
                    in-canvas toolbar), but it isn't offered as a switch
                    option from this menu. */}

                {/* Dashboard - Available to all logged-in users */}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    router.push("/dashboard");
                    router.refresh();
                  }}
                  className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"
                    />
                  </svg>
                  My Dashboard
                </button>

                {/* Browse Gallery — alongside the primary project actions */}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    router.push("/gallery");
                  }}
                  className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Browse Gallery
                </button>

                {/* Editor-only actions: Share, Gallery, project management */}
                {isEditor && (
                  <>
                    <div className="border-t border-border/50 my-2" />

                    {/* Share */}
                    <button
                      onClick={handleShare}
                      className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                        />
                      </svg>
                      Share File
                    </button>

                    {/* Add to Gallery */}
                    <button
                      onClick={handleToggleGallery}
                      disabled={!projectId}
                      className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {inGallery ? "Remove from Gallery" : "Add to Gallery"}
                    </button>

                    {/* File Actions - Only for saved projects */}
                    {projectId && projectSlug && (
                      <>
                        {/* View Project */}
                        <button
                          onClick={() => {
                            setIsOpen(false);
                            router.push(`/view/${encodeProjectId(projectId)}`);
                          }}
                          className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          View Project
                        </button>

                        {/* Toggle Publish/Private */}
                        <button
                          onClick={handleTogglePublish}
                          className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            {isPublished ? (
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            ) : (
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            )}
                          </svg>
                          {isPublished ? "Make Private" : "Make Shareable"}
                        </button>

                        {/* Duplicate/Copy */}
                        <button
                          onClick={handleDuplicate}
                          className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                          Duplicate File
                        </button>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            <div className="border-t border-border/50 my-2" />

            {/* Internals group — order: About, Help, API Docs, Theme, Admin,
                Report an issue, My tickets. (Browse Gallery leads for
                signed-out visitors, who see none of the gated items.) */}

            {/* Browse Gallery — shown here for signed-out users; signed-in users
                have it up top with the project actions */}
            {!user && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push("/gallery");
                }}
                className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Browse Gallery
              </button>
            )}

            {/* About */}
            <button
              onClick={() => {
                setIsOpen(false);
                router.push("/about");
              }}
              className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              About
            </button>

            {/* Help & Documentation — public getting-started guide. Signed-in
                users land on the complete creator guide via the in-page link. */}
            <button
              onClick={() => {
                setIsOpen(false);
                router.push(user ? "/docs/creator" : "/docs");
              }}
              className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Help
            </button>

            {/* API Docs — external published API reference (signed-in users
                only). URL is configurable per environment via the Vercel env
                var NEXT_PUBLIC_API_DOCS_URL (inlined at build time); falls back
                to the published Postman API docs (safe default for cutover). */}
            {user && (
              <a
                href={
                  process.env.NEXT_PUBLIC_API_DOCS_URL ||
                  "https://documenter.getpostman.com/view/54883007/2sBXqRiwAo#intro"
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
              >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              API Docs
              <svg
                className="w-3 h-3 ml-auto opacity-60"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              </a>
            )}

            {/* Theme — internal preference (signed-in) */}
            {user && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowPaletteModal(true);
                  setThemePromptActive(false);
                }}
                className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
              >
                <Palette className="w-4 h-4" />
                Theme
              </button>
            )}

            {/* Admin — internal tools (admin / super_admin only) */}
            {isAdmin && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push("/admin");
                }}
                className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Admin
                {pendingInvites > 0 && (
                  <span
                    className="fc-admin-pending-dot ml-auto"
                    aria-label={`${pendingInvites} pending invite${pendingInvites === 1 ? "" : "s"} to review`}
                    title={`${pendingInvites} pending invite${pendingInvites === 1 ? "" : "s"} to review`}
                  />
                )}
              </button>
            )}

            {/* Issue tracking — signed-in users, grouped with the docs/help items */}
            {user && (
              <>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    window.dispatchEvent(new CustomEvent("fc:open-issue-reporter"));
                  }}
                  className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                  Report an issue
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    router.push("/tickets");
                  }}
                  className="w-full text-left px-5 py-3 text-sm menu-item-text menu-item transition-all flex items-center gap-3 touch-manipulation min-h-[44px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  My tickets
                </button>
              </>
            )}

            <div className="border-t border-border/50 my-2" />

            {/* Mode & Theme Settings */}
            <div className="px-5 py-4 menu-section-header space-y-4">
              {!viewActions && user && (
                <div>
                  <div className="text-xs menu-item-secondary mb-2">Mode</div>
                  <ModeSelector />
                </div>
              )}
              {showThemeToggle && (
                <div>
                  <div className="text-xs menu-item-secondary mb-2">Theme</div>
                  <ThemeToggle />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => {
          setShowAuth(false);
          // Navigate to editor so user can start working immediately
          router.push("/");
        }}
      />

      <SlugInputModal
        isOpen={showSlugInput}
        value={titleInput}
        onChange={setTitleInput}
        onSubmit={handleCreateProject}
        onCancel={() => setShowSlugInput(false)}
        loading={saving}
      />

      {showLoadModal && (
        <ProjectPickerModal
          isOpen={showLoadModal}
          onClose={() => setShowLoadModal(false)}
          onSelect={handleSelectProject}
          onCreateNew={() => {
            setShowLoadModal(false);
            setShowSlugInput(true);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />

      <MessageDialog
        isOpen={messageDialog.isOpen}
        onClose={() => setMessageDialog({ ...messageDialog, isOpen: false })}
        title={messageDialog.title}
        message={messageDialog.message}
        variant={messageDialog.variant}
      />

      {projectId && projectSlug && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          shareUrl={`${
            typeof window !== "undefined" ? window.location.origin : ""
          }/?file=${encodeProjectId(projectId)}`}
          fileSlug={projectSlug}
          isPublished={isPublished}
        />
      )}

      <PalettePickerModal
        isOpen={showPaletteModal}
        onClose={() => {
          if (themePromptActive) recordThemePromptDismissal();
          setShowPaletteModal(false);
          setThemePromptActive(false);
        }}
        promptMode={themePromptActive}
      />
    </>
  );
}
