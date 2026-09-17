"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProjectMenu } from "./project-menu";
import { ThemeToggle } from "./theme-toggle";
import { ShareModal } from "./share-modal";
import { AuthModal } from "./auth-modal";
import { SlugInputModal } from "./slug-input-modal";
import { useFourCornersStore } from "@/lib/store";
import { togglePublish, toggleGallery } from "@/lib/api-client/project-actions";
import { useProjectMetadata } from "@/hooks/useProjectMetadata";
import { useProjectSave } from "@/hooks/useProjectSave";
import { notifySave, notifyFile } from "@/lib/notify";
import { useAccess } from "./access-provider";

interface AppHeaderProps {
  showProjectMenu?: boolean;
  onImportClick?: () => void;
  onExportClick?: () => void;
  onClearAll?: () => void;
  isPublished?: boolean;
  onPublishToggle?: (published: boolean) => void;
  inGallery?: boolean;
  onGalleryToggle?: (inGallery: boolean) => void;
  /** View page specific actions */
  viewActions?: {
    onShare?: () => void;
    onEdit?: () => void;
    onDownloadJSON?: () => void;
    onDownloadIIIF?: () => void;
    isOwnProject?: boolean;
  };
}

export function AppHeader({
  showProjectMenu = false,
  onImportClick,
  onExportClick,
  onClearAll,
  isPublished,
  onPublishToggle,
  inGallery,
  onGalleryToggle,
  viewActions,
}: AppHeaderProps) {
  const router = useRouter();
  // Auth comes from the single app-wide AccessProvider (mounted at the layout
  // root); per-page chrome (editor save button, view actions) still arrives via
  // props, so intentionally chrome-less routes stay chrome-less.
  const { user, signOut } = useAccess();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHeaderAuth, setShowHeaderAuth] = useState(false);
  const [showSlugInput, setShowSlugInput] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  // Get project state from store
  const projectId = useFourCornersStore((state) => state.projectId);
  const projectSlug = useFourCornersStore((state) => state.projectSlug);
  const pendingSlug = useFourCornersStore((state) => state.pendingSlug);
  const pendingTitle = useFourCornersStore((state) => state.pendingTitle);
  const hasUnsavedChanges = useFourCornersStore(
    (state) => state.hasUnsavedChanges,
  );
  const imageSrc = useFourCornersStore((state) => state.imageSrc);
  const hasProject = Boolean(projectId && projectSlug);

  // Project save hooks
  const { buildMetadata } = useProjectMetadata();
  const { saving, saveStatus, save, createNew, checkAuth } = useProjectSave();

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/--+/g, "-")
      .replace(/^-+/, "");
  }

  // Header save button handler — handles auth + new project creation
  const handleHeaderSave = async () => {
    const metadata = buildMetadata();
    const result = await save(metadata);

    if (result.error) {
      notifySave.failed(result.error);
    } else if (result.requiresAuth) {
      setShowHeaderAuth(true);
    } else if (result.requiresSlug) {
      // Auto-create with pending slug from title if available
      if (pendingSlug?.trim()) {
        const userId = await checkAuth();
        if (!userId) {
          setShowHeaderAuth(true);
          return;
        }
        const title = pendingTitle?.trim() || undefined;
        const createResult = await createNew(metadata, userId, pendingSlug.trim(), title);
        if (createResult.success) {
          if (useFourCornersStore.getState().projectId) {
            useFourCornersStore.setState({ projectTitle: title || null });
          }
        } else if (createResult.error) {
          notifySave.createFailed(createResult.error);
        }
      } else {
        setShowSlugInput(true);
      }
    }
  };

  const handleSlugCreate = async () => {
    const userId = await checkAuth();
    if (!userId) return;

    if (!titleInput.trim()) {
      notifyFile.nameRequired();
      return;
    }

    const title = titleInput.trim();
    const slug = slugify(title);
    if (!slug) {
      notifyFile.nameRequired();
      return;
    }

    const metadata = buildMetadata();
    const result = await createNew(metadata, userId, slug, title);

    if (result.success) {
      if (useFourCornersStore.getState().projectId) {
        useFourCornersStore.setState({ projectTitle: title });
      }
      setShowSlugInput(false);
      setTitleInput("");
    } else if (result.error) {
      notifySave.createFailed(result.error);
    }
  };

  // Show save button on the editor page (showProjectMenu is true only there)
  // whenever there's something to save — a main image OR unsaved changes
  // (e.g. an audio-first draft with no image yet).
  const showSaveButton =
    user && showProjectMenu && !viewActions && (imageSrc || hasUnsavedChanges);
  const isSaved = saveStatus === "saved" || (!hasUnsavedChanges && !!projectId);
  const isSaveDisabled = saving || isSaved || (!imageSrc && !hasUnsavedChanges);
  const saveButtonText = saving
    ? "Saving..."
    : isSaved
      ? "Saved"
      : "Save";

  // File action handlers for mobile menu
  const handleMobileSave = async () => {
    setShowMobileMenu(false);
    await handleHeaderSave();
  };

  const handleMobilePublishToggle = async () => {
    if (!projectId) return;
    setShowMobileMenu(false);
    const newState = !isPublished;
    await togglePublish(projectId, newState);
    if (onPublishToggle) onPublishToggle(newState);
  };

  const handleMobileGalleryToggle = async () => {
    if (!projectId) return;
    setShowMobileMenu(false);
    const newState = !inGallery;
    await toggleGallery(projectId, newState);
    if (onGalleryToggle) onGalleryToggle(newState);
  };

  const handleSignOut = async () => {
    await signOut();
    setShowUserMenu(false);
    router.push("/gallery");
  };

  return (
    <header
      id="top"
      className="header-glass fixed top-0 left-0 right-0 z-50 border-b border-border shadow-lg flex-shrink-0"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          {/* Logo/Branding */}
          <Link
            href={user ? "/?new=true" : "/gallery"}
            className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            <div className="grid grid-cols-2 gap-0.5">
              <div
                className="w-3 h-3 md:w-4 md:h-4 rounded-[2px] bg-corner-context"
                title="Related Imagery/Context"
              ></div>
              <div
                className="w-3 h-3 md:w-4 md:h-4 rounded-[2px] bg-corner-links"
                title="Links"
              ></div>
              <div
                className="w-3 h-3 md:w-4 md:h-4 rounded-[2px] bg-corner-backstory"
                title="Backstory"
              ></div>
              <div
                className="w-3 h-3 md:w-4 md:h-4 rounded-[2px] bg-corner-creativeCommons"
                title="Authorship"
              ></div>
            </div>
            <span className="header-text text-sm md:text-base font-medium whitespace-nowrap">
              Four Corners
            </span>
          </Link>

          {/* Center spacer */}
          <div className="flex-1"></div>

          {/* Navigation - Desktop */}
          <nav className="hidden sm:flex items-center gap-1 sm:gap-4">
            {/* Save Button */}
            {showSaveButton && (
              <button
                onClick={handleHeaderSave}
                disabled={isSaveDisabled}
                className={`fc-save-btn flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all text-sm font-medium whitespace-nowrap ${
                  isSaveDisabled
                    ? "opacity-50 cursor-not-allowed"
                    : "active:scale-95 touch-manipulation"
                }`}
              >
                {saveButtonText}
              </button>
            )}

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Project Menu - always visible on desktop for auth and navigation (login is inside menu) */}
            <ProjectMenu
              onImportClick={onImportClick || (() => {})}
              onExportClick={onExportClick}
              onClearAll={onClearAll}
              isPublished={isPublished}
              onPublishToggle={onPublishToggle}
              inGallery={inGallery}
              onGalleryToggle={onGalleryToggle}
              isEditor={showProjectMenu}
              viewActions={viewActions}
            />
          </nav>

          {/* Mobile Controls - ProjectMenu grid icon always visible */}
          <div className="flex sm:hidden items-center gap-2">
            {/* Save Button on mobile */}
            {showSaveButton && (
              <button
                onClick={handleHeaderSave}
                disabled={isSaveDisabled}
                className={`fc-save-btn flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all text-xs font-medium whitespace-nowrap ${
                  isSaveDisabled
                    ? "opacity-50 cursor-not-allowed"
                    : "active:scale-95 touch-manipulation"
                }`}
              >
                {saveButtonText}
              </button>
            )}

            {/* ProjectMenu on mobile - always show for navigation (login is inside menu) */}
            <ProjectMenu
              onImportClick={onImportClick || (() => {})}
              onExportClick={onExportClick}
              onClearAll={onClearAll}
              isPublished={isPublished}
              onPublishToggle={onPublishToggle}
              inGallery={inGallery}
              onGalleryToggle={onGalleryToggle}
              isEditor={showProjectMenu}
              showThemeToggle={true}
              viewActions={viewActions}
            />
          </div>
        </div>
      </div>

      {/* Share Modal — uses /share/ route for stable public URLs */}
      {projectSlug && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          shareUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/share/${projectSlug}`}
          fileSlug={projectSlug}
          isPublished={isPublished}
        />
      )}

      {/* Auth modal for header save button */}
      <AuthModal
        isOpen={showHeaderAuth}
        onClose={() => setShowHeaderAuth(false)}
        onSuccess={() => {
          setShowHeaderAuth(false);
          handleHeaderSave();
        }}
      />

      {/* Slug input for new projects via header save */}
      <SlugInputModal
        isOpen={showSlugInput}
        value={titleInput}
        onChange={setTitleInput}
        onSubmit={handleSlugCreate}
        onCancel={() => setShowSlugInput(false)}
        loading={saving}
      />

      {/* Mode color indicator — bottom border reflecting data mode */}
      {showProjectMenu && <ModeColorBorder />}
    </header>
  );
}

function ModeColorBorder() {
  const mode = useFourCornersStore((s) => s.mode);
  const bg =
    mode === "minimal"
      ? "var(--fc-corner-cc)"
      : mode === "standard"
        ? "linear-gradient(to right, var(--fc-corner-backstory), var(--fc-corner-context), var(--fc-corner-links))"
        : "linear-gradient(to right, var(--fc-corner-backstory), var(--fc-corner-context), var(--fc-corner-links), var(--fc-corner-cc))";
  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-0.5 transition-all"
      style={{ background: bg }}
      aria-hidden="true"
    />
  );
}
