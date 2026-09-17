/**
 * Four Corners Editor - Main Page
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  notify,
  notifyAuth,
  notifyFile,
  notifyImport,
  notifyPublish,
  notifyShare,
} from "@/lib/notify";
import { clearLocalStorageOnSignIn } from "@/lib/storage-manager";
import { ModeHint } from "@/components/mode-hint";
import { FileNameEditor } from "@/components/file-name-editor";
import { SharedProjectBanner } from "@/components/shared-project-banner";
import { ImageDropZone } from "@/components/image-drop-zone";
import { BackstoryEditor } from "@/components/backstory-editor";
import { CaptionCreditEthics } from "@/components/caption-credit-ethics";
import { ContextImages } from "@/components/context-images";
import { LinksManager } from "@/components/links-manager";
import { LocationCapture } from "@/components/location-capture";
import { ExportDialog } from "@/components/export-dialog";
import { ImportDialog } from "@/components/import-dialog";
import { MetadataInspector } from "@/components/metadata-inspector";
import { CornerSelector } from "@/components/corner-selector";
import type { FourCornersMetadataExtended } from "@/lib/schema";
import { useFourCornersStore } from "@/lib/store";
import { useMediaCleanup } from "@/hooks/use-media-cleanup";
import {
  getProjectBySlugOrId,
  userHasFileWithSlug,
  createProject,
  updateProject,
  togglePublish,
  toggleGallery,
  updateProjectTags,
  GALLERY_LIMIT_REACHED,
} from "@/lib/db/projects";
import { decodeProjectId, encodeProjectId } from "@/lib/encode-id";
import { SEED_TAGS, displayTag, normalizeTags } from "@/lib/tags";
import { Eye, X } from "lucide-react";
import { refreshVoiceRecordingUrls } from "@/lib/supabase-voice-storage";
import {
  savePendingImport,
  getPendingImport,
  clearPendingImport,
} from "@/lib/pending-import-storage";
import { SharedFileImportDialog } from "@/components/shared-file-import-dialog";
import { ScrollToTop } from "@/components/scroll-to-top";
import { SectionProgress } from "@/components/section-progress";
import { LoadingOverlay } from "@/components/loading-overlay";
import { AppHeader } from "@/components/app-header";
import { FourCornersJsPreview } from "@/components/four-corners-js-preview";
import { useAutosave } from "@/hooks/useAutosave";
import { AutosaveIndicator } from "@/components/autosave-indicator";
import { useLocalPersistence } from "@/hooks/useLocalPersistence";
import { DEV_USER, isDevAuthClient } from "@/lib/dev-auth";
import dynamic from "next/dynamic";

const SketchboardEditor = dynamic(
  () => import("@/components/sketchboard/SketchboardEditor"),
  { ssr: false },
);

export default function Home() {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [viewingSharedProject, setViewingSharedProject] = useState(false);
  const [sharedProjectOwner, setSharedProjectOwner] = useState<string | null>(
    null,
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showSharedImportDialog, setShowSharedImportDialog] = useState(false);
  const [sharedFileData, setSharedFileData] = useState<{
    slug: string;
    metadata: FourCornersMetadataExtended;
    mainImageUrl?: string;
    hasExisting?: boolean;
  } | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [inGallery, setInGallery] = useState(false);
  const [projectTags, setProjectTags] = useState<string[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const projectId = useFourCornersStore((state) => state.projectId);
  const projectSlug = useFourCornersStore((state) => state.projectSlug);
  const hasUnsavedChanges = useFourCornersStore(
    (state) => state.hasUnsavedChanges,
  );
  const reset = useFourCornersStore((state) => state.reset);
  const layoutMode = useFourCornersStore((state) => state.layoutMode);
  const context = useFourCornersStore((state) => state.context);
  const backStory = useFourCornersStore((state) => state.backStory);
  const links = useFourCornersStore((state) => state.links);
  const creativeCommons = useFourCornersStore((state) => state.creativeCommons);
  const photographerInfo = useFourCornersStore(
    (state) => state.photographerInfo,
  );

  const importMetadata = useFourCornersStore((state) => state.importMetadata);
  const setProjectId = useFourCornersStore((state) => state.setProjectId);
  const setImageSrc = useFourCornersStore((state) => state.setImageSrc);
  const markSaved = useFourCornersStore((state) => state.markSaved);
  const setVoiceTranscriptions = useFourCornersStore(
    (state) => state.setVoiceTranscriptions,
  );

  // Section refs for scroll-to functionality
  const sectionRefs = {
    "credit-ethics": useRef<HTMLDivElement>(null),
    backstory: useRef<HTMLDivElement>(null),
    "context-images": useRef<HTMLDivElement>(null),
    links: useRef<HTMLDivElement>(null),
  };

  // Track if this is initial page load vs active sign-in
  // Used to prevent clearing work on page refresh when already logged in
  const isInitialLoadRef = useRef(true);
  // Track whether user was already logged in — prevents token refresh
  // (which fires SIGNED_IN) from being mistaken for a fresh sign-in
  const wasLoggedInRef = useRef(false);

  // Clean up orphaned IndexedDB blobs on app init
  useMediaCleanup();

  // Persist imageSrc & consentDocuments to IndexedDB (survives refresh for logged-out users)
  useLocalPersistence();

  // Autosave for logged-in users editing existing projects
  const { autosaveStatus, lastAutosaveError } = useAutosave({
    enabled: isLoggedIn && !viewingSharedProject,
  });

  // Sync published/gallery status from DB whenever projectId changes.
  useEffect(() => {
    if (!projectId || !supabase) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("published, in_gallery")
          .eq("id", projectId)
          .single();

        if (!cancelled && data && !error) {
          setIsPublished(data.published ?? false);
          setInGallery(data.in_gallery ?? false);
          setProjectTags(data.tags ?? []);
        }
      } catch {
        // Non-critical — button defaults to "Publish" which is safe
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, supabase]);

  // Track authentication state
  useEffect(() => {
    // Dev auth bypass
    if (isDevAuthClient()) {
      setIsLoggedIn(true);
      setCurrentUserId(DEV_USER.id);
      setAuthChecked(true);
      wasLoggedInRef.current = true;
      setTimeout(() => { isInitialLoadRef.current = false; }, 100);
      return;
    }

    if (!supabase) return;

    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      const loggedIn = !!data.session?.user;
      setIsLoggedIn(loggedIn);
      setCurrentUserId(data.session?.user?.id || null);
      wasLoggedInRef.current = loggedIn;

      const params = new URLSearchParams(window.location.search);
      const hasFileParam = params.get("file") || params.get("project");
      const isNewFile = params.get("new") === "true";
      const authRequired = params.get("auth") === "required";

      if (isNewFile) {
        // Reset state for new file and clear URL param
        reset();
        window.history.replaceState({}, "", "/");
      }

      // Clean up auth=required param
      if (authRequired) {
        window.history.replaceState({}, "", "/");
      }

      // Gate: not logged in → reset state so no stale data is visible
      if (!loggedIn && !hasFileParam) {
        reset();
      }

      setAuthChecked(true);

      // Mark initial load complete after checking session
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 100);
    };
    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        const wasAlreadyLoggedIn = wasLoggedInRef.current;
        setIsLoggedIn(!!session?.user);
        setCurrentUserId(session?.user?.id || null);
        wasLoggedInRef.current = !!session?.user;

        // Determine if this is a fresh sign-in or just a token refresh.
        const isFreshSignIn =
          event === "SIGNED_IN" &&
          !isInitialLoadRef.current &&
          !wasAlreadyLoggedIn;

        // Toast notification only for fresh sign-in (not page refresh)
        if (isFreshSignIn && session?.user) {
          notifyAuth.signedIn(session.user.email || "");

          // Check for pending shared file import (IndexedDB first, then localStorage fallback)
          setTimeout(async () => {
            try {
              // Check IndexedDB first (has full metadata including voice recordings)
              let importData = await getPendingImport();
              const hasFullMetadata = !!importData?.metadata;

              // Fallback to localStorage (minimal data, will need DB fetch)
              if (!importData) {
                const localPending = localStorage.getItem(
                  "pendingSharedImport",
                );
                if (localPending) {
                  try {
                    importData = JSON.parse(localPending);
                    localStorage.removeItem("pendingSharedImport");
                  } catch {
                    localStorage.removeItem("pendingSharedImport");
                  }
                }
              } else {
                // Clear IndexedDB entry
                await clearPendingImport();
              }

              if (!importData) return;

              // Check if intent is still fresh (within 5 minutes)
              if (Date.now() - importData.timestamp >= 5 * 60 * 1000) {
                return;
              }

              const userId = session.user.id;

              // If we have full metadata from IndexedDB, use it directly
              if (hasFullMetadata && importData.metadata) {
                // Check if user has existing file with this slug
                const existingProject = importData.slug
                  ? await userHasFileWithSlug(userId, importData.slug)
                  : null;

                setSharedFileData({
                  slug: importData.slug,
                  metadata: importData.metadata,
                  mainImageUrl: importData.mainImageUrl,
                  hasExisting: !!existingProject,
                });
                setShowSharedImportDialog(true);

                // Restore the share URL so context is visible
                if (importData.encodedId) {
                  window.history.replaceState(
                    {},
                    "",
                    `/?file=${importData.encodedId}`,
                  );
                }
              } else {
                // Fallback: fetch from DB using encodedId
                const decodedId = importData.encodedId
                  ? decodeProjectId(importData.encodedId)
                  : importData.slug;
                const project = await getProjectBySlugOrId(decodedId);

                if (!project) {
                  throw new Error("Shared file not found");
                }

                const existingProject = project.slug
                  ? await userHasFileWithSlug(userId, project.slug)
                  : null;

                setSharedFileData({
                  slug: project.slug || importData.slug,
                  metadata: project.metadata,
                  mainImageUrl: project.main_image_url,
                  hasExisting: !!existingProject,
                });
                setShowSharedImportDialog(true);

                if (importData.encodedId) {
                  window.history.replaceState(
                    {},
                    "",
                    `/?file=${importData.encodedId}`,
                  );
                }
              }
            } catch (error) {
              console.error("Failed to auto-import shared file:", error);
              notify.error(`Failed to import: ${error instanceof Error ? error.message : "Unknown error"}`);
              await clearPendingImport();
            }
          }, 1000);
        } else if (event === "SIGNED_OUT") {
          notifyAuth.signedOut();
        } else if (event === "USER_UPDATED") {
          notifyAuth.accountUpdated();
        }

        // DATA HIERARCHY: Supabase (logged in) > IndexedDB (logged out)
        if (isFreshSignIn && session?.user) {
          await clearLocalStorageOnSignIn();
          reset();
        }

        // Mark initial load complete after first auth event
        isInitialLoadRef.current = false;
      },
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  const scrollToSection = (sectionId: string) => {
    const ref = sectionRefs[sectionId as keyof typeof sectionRefs];
    if (!ref?.current) return;

    // Scroll into view with offset for header
    ref.current.scrollIntoView({ behavior: "smooth", block: "start" });

    // Brief highlight animation
    ref.current.classList.add("fc-section-highlight");
    setTimeout(() => {
      ref.current?.classList.remove("fc-section-highlight");
    }, 1500);
  };

  const handleClearAll = () => {
    const ok = confirm(
      "Clear all data? This will reset all fields and cannot be undone.",
    );
    if (ok) {
      reset();
      notifyFile.cleared();
    }
  };

  const handleCopySharedProject = async () => {
    if (!currentUserId || !projectSlug) return;

    try {
      notify.info(
        "Project copy feature is being implemented. You can export the JSON and import it to create your own version.",
      );

      // Clear viewing shared state
      setViewingSharedProject(false);
      setSharedProjectOwner(null);
    } catch {
      notifyShare.copyFailed();
    }
  };

  const handleLoginForCopy = async () => {
    // Get the current file parameter from URL to preserve it
    const params = new URLSearchParams(window.location.search);
    const fileParam = params.get("file") || params.get("project");

    try {
      await savePendingImport({
        slug: projectSlug || sharedFileData?.slug || "shared-file",
        encodedId: fileParam || undefined,
        metadata: sharedFileData?.metadata,
        mainImageUrl: sharedFileData?.mainImageUrl,
      });
    } catch {
      // Continue anyway - user can manually reload the shared file
    }
    // Force re-check: setting isLoggedIn false triggers the auth gate
    setIsLoggedIn(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        setIsExportOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        setIsImportOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Load project from URL parameter (slug or ID)
  useEffect(() => {
    const loadProjectBySlugOrId = async (slugOrId: string) => {
      setLoadingProject(true);

      try {
        // Get current session to check user ownership
        const {
          data: { session },
        } = await supabase.auth.getSession();

        // Load project by slug or ID
        const project = await getProjectBySlugOrId(slugOrId, session?.user?.id);

        // Check if viewing someone else's project
        const isOwnProject =
          session?.user?.id && session.user.id === project.user_id;

        if (!isOwnProject) {
          // Security: Only allow viewing shared files if they are published
          if (!project.published) {
            notifyFile.private();
            throw new Error("This file is private and cannot be accessed");
          }

          // If user is logged in and this is a slug-based share, offer to import
          if (session?.user?.id && project.slug) {
            const existingProject = await userHasFileWithSlug(
              session.user.id,
              project.slug,
            );

            setSharedFileData({
              slug: project.slug,
              metadata: project.metadata,
              mainImageUrl: project.main_image_url,
              hasExisting: !!existingProject,
            });
            setShowSharedImportDialog(true);
            setLoadingProject(false);
            return;
          }

          // Viewing shared file - show in read-only mode
          setViewingSharedProject(true);
          setSharedProjectOwner(project.user_id);

          setSharedFileData({
            slug: project.slug || "",
            metadata: project.metadata,
            mainImageUrl: project.main_image_url,
            hasExisting: false,
          });
        }

        // Clear stale IndexedDB data before importing fresh cloud data
        const { localPersistence } = await import("@/lib/local-persistence");
        await localPersistence.clear();

        // Reset ALL store state first
        reset();

        // Import metadata into store
        importMetadata(project.metadata);

        // Handle voice transcriptions
        if (
          project.metadata.voiceTranscriptions &&
          project.metadata.voiceTranscriptions.length > 0
        ) {
          refreshVoiceRecordingUrls(project.metadata.voiceTranscriptions).then(
            (refreshedTranscriptions) => {
              setVoiceTranscriptions(refreshedTranscriptions);
            },
          );
        } else {
          setVoiceTranscriptions([]);
        }

        // Show success notification
        const fileTitle = project.title || project.slug || "File";
        if (isOwnProject) {
          notifyFile.loaded(fileTitle);
        } else {
          notify.info(`Viewing shared file: ${fileTitle}`);
        }

        // Set project ID and mark as saved
        setProjectId(project.id, project.slug || "", project.title ?? undefined);
        markSaved();

        // Set published and gallery state
        setIsPublished(project.published);
        setInGallery(project.in_gallery || false);
        setProjectTags(project.tags ?? []);

        // Load main image if available
        if (project.main_image_url) {
          setImageSrc(project.main_image_url);
          localPersistence.set("imageSrc", project.main_image_url).catch(() => {});
        }

        // Clear the URL parameter to avoid reloading on refresh
        window.history.replaceState({}, "", "/");

        // Clear loading state on success
        setLoadingProject(false);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "";
        if (errMsg.includes("private")) {
          // Already showed notification above
        } else if (errMsg.includes("not found")) {
          notifyFile.notFound();
        } else {
          notify.error(`Failed to load file: ${errMsg || "Unknown error"}`);
        }

        setViewingSharedProject(false);
        setLoadingProject(false);
      }
    };

    const params = new URLSearchParams(window.location.search);
    const fileParam = params.get("file") || params.get("project");

    if (fileParam) {
      const decodedParam = decodeProjectId(fileParam);
      loadProjectBySlugOrId(decodedParam);
    }
  }, [
    importMetadata,
    setProjectId,
    setImageSrc,
    markSaved,
    setVoiceTranscriptions,
    supabase,
  ]);

  // Handle shared file import confirmation
  const handleSharedFileImport = async () => {
    if (!sharedFileData || !currentUserId) return;

    setLoadingProject(true);

    try {
      setShowSharedImportDialog(false);

      const existingProject = await userHasFileWithSlug(
        currentUserId,
        sharedFileData.slug,
      );

      if (existingProject) {
        await updateProject(
          existingProject.id,
          sharedFileData.metadata,
          currentUserId,
          sharedFileData.mainImageUrl,
        );
        setProjectId(
          existingProject.id,
          sharedFileData.slug,
          existingProject.title ?? undefined,
        );
        notify.success(`"${sharedFileData.slug}" updated`);
      } else {
        let finalSlug = sharedFileData.slug;
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
          try {
            const newProject = await createProject(
              sharedFileData.metadata,
              currentUserId,
              finalSlug,
              sharedFileData.mainImageUrl,
            );
            setProjectId(
              newProject.id,
              newProject.slug || "",
              newProject.title ?? undefined,
            );
            notify.success(`"${finalSlug}" created`);
            break;
          } catch (createError: unknown) {
            const pgError = createError as { code?: string };
            if (pgError.code === "23505" && attempts < maxAttempts - 1) {
              attempts++;
              finalSlug = `${sharedFileData.slug}-${Date.now()}`;
            } else {
              throw createError;
            }
          }
        }
      }

      // Clear stale IndexedDB data
      const { localPersistence } = await import("@/lib/local-persistence");
      await localPersistence.clear();

      // Load the metadata and image into the editor
      importMetadata(sharedFileData.metadata);

      // Handle voice transcriptions
      if (
        sharedFileData.metadata.voiceTranscriptions &&
        sharedFileData.metadata.voiceTranscriptions.length > 0
      ) {
        refreshVoiceRecordingUrls(
          sharedFileData.metadata.voiceTranscriptions,
        ).then((refreshedTranscriptions) => {
          setVoiceTranscriptions(refreshedTranscriptions);
        });
      } else {
        setVoiceTranscriptions([]);
      }

      if (sharedFileData.mainImageUrl) {
        setImageSrc(sharedFileData.mainImageUrl);
        localPersistence.set("imageSrc", sharedFileData.mainImageUrl).catch(() => {});
      }
      markSaved();

      window.history.replaceState({}, "", "/");
    } catch (error) {
      console.error("Failed to import shared file:", error);
      notify.error(error instanceof Error ? error.message : "Failed to import shared file");
    } finally {
      setSharedFileData(null);
      setLoadingProject(false);
    }
  };

  // Handle viewing shared file without importing
  const handleViewSharedFile = async () => {
    if (!sharedFileData) return;

    setShowSharedImportDialog(false);
    setViewingSharedProject(true);

    const { localPersistence } = await import("@/lib/local-persistence");
    await localPersistence.clear();

    importMetadata(sharedFileData.metadata);

    // Handle voice transcriptions
    if (
      sharedFileData.metadata.voiceTranscriptions &&
      sharedFileData.metadata.voiceTranscriptions.length > 0
    ) {
      refreshVoiceRecordingUrls(
        sharedFileData.metadata.voiceTranscriptions,
      ).then((refreshedTranscriptions) => {
        setVoiceTranscriptions(refreshedTranscriptions);
      });
    } else {
      setVoiceTranscriptions([]);
    }

    notify.info(`Viewing shared file: ${sharedFileData.slug}`);
    if (sharedFileData.mainImageUrl) {
      setImageSrc(sharedFileData.mainImageUrl);
      localPersistence.set("imageSrc", sharedFileData.mainImageUrl).catch(() => {});
    }

    window.history.replaceState({}, "", "/");
    setSharedFileData(null);
  };

  const handleCancelImport = () => {
    setShowSharedImportDialog(false);
    setSharedFileData(null);
    notifyImport.cancelled();
  };

  // Auth gate: redirect unauth users to gallery (unless viewing a shared file)
  useEffect(() => {
    if (authChecked && !isLoggedIn) {
      const params = new URLSearchParams(window.location.search);
      const hasSharedFile = params.get("file") || params.get("project");
      if (!hasSharedFile) {
        setRedirecting(true);
        router.replace("/gallery");
      }
    }
  }, [authChecked, isLoggedIn, router]);

  if (redirecting) {
    return (
      <div className="min-h-screen flex flex-col text-gray-100 overflow-x-hidden">
        <LoadingOverlay isLoading={true} text="Loading..." />
      </div>
    );
  }

  // Show nothing until auth check completes (prevents editor flash)
  if (!authChecked) {
    return (
      <div className="min-h-screen flex flex-col text-gray-100 overflow-x-hidden">
        <LoadingOverlay isLoading={true} text="Loading..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col text-gray-100 overflow-x-hidden">
      {/* Loading overlay for shared links and project loading */}
      <LoadingOverlay isLoading={loadingProject} text="Loading file..." />

      <AppHeader
        showProjectMenu={true}
        onImportClick={() => setIsImportOpen(true)}
        onExportClick={() => setIsExportOpen(true)}
        onClearAll={handleClearAll}
        isPublished={isPublished}
        onPublishToggle={setIsPublished}
        inGallery={inGallery}
        onGalleryToggle={setInGallery}
      />
      {/* Spacer for fixed header */}
      <div className="h-14 sm:h-16 flex-shrink-0" />

      {/* Shared Project Banner */}
      {viewingSharedProject && projectSlug && (
        <SharedProjectBanner
          projectSlug={projectSlug}
          projectOwner={sharedProjectOwner || undefined}
          isLoggedIn={isLoggedIn}
          currentUserId={currentUserId || undefined}
          onCopyProject={handleCopySharedProject}
          onLogin={handleLoginForCopy}
        />
      )}

      <div className="flex-1 flex flex-col">
        {layoutMode === "sketchboard" ? (
          <SketchboardEditor
            isReadOnly={viewingSharedProject}
            autosaveStatus={autosaveStatus}
            lastAutosaveError={lastAutosaveError}
            isPublished={isPublished}
            inGallery={inGallery}
            onExport={() => setIsExportOpen(true)}
            onImport={() => setIsImportOpen(true)}
          />
        ) : (
        <div className="max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full">
          <ModeHint />
          <FileNameEditor />
          <AutosaveIndicator status={autosaveStatus} error={lastAutosaveError} />
          <main id="main-content" role="main" aria-label="Project editor" className="scroll-mt-20">
            {/* Visually hidden h1 so screen readers + page outliners have an
                anchor. The visible title sits in <FileNameEditor /> above. */}
            <h1 className="sr-only">Four Corners project editor</h1>
            <ImageDropZone onCornerClick={scrollToSection} />
            <CornerSelector />
            <section
              id="caption-credit-ethics"
              ref={sectionRefs["credit-ethics"]}
              aria-label="Authorship section: caption, credit, and ethics"
              className="scroll-mt-20"
            >
              <CaptionCreditEthics />
            </section>
            <section
              id="backstory"
              ref={sectionRefs["backstory"]}
              aria-label="Backstory section"
              className="scroll-mt-20"
            >
              <BackstoryEditor />
            </section>
            <section
              id="context-images"
              ref={sectionRefs["context-images"]}
              aria-label="Still life context section"
              className="scroll-mt-20"
            >
              <ContextImages
                initiallyExpanded={viewingSharedProject || context.length > 0}
              />
            </section>
            <section
              id="links"
              ref={sectionRefs["links"]}
              aria-label="Links section"
              className="scroll-mt-20"
            >
              <LinksManager />
            </section>
            <LocationCapture />
          </main>

          {/* Four Corners Interactive Preview */}
          <FourCornersJsPreview onCornerClick={scrollToSection} />

          {/* Preview Gallery — always available in the editor. Opens the
              public /view page in a new tab so the author can see what
              visitors will see, regardless of gallery state. */}
          <section id="preview-gallery" className="pt-2 scroll-mt-20" aria-label="Preview gallery section">
            <button
              type="button"
              onClick={() => {
                const { projectId: currentId, projectSlug } =
                  useFourCornersStore.getState();
                if (!currentId) {
                  notify.info("Save your file first to preview the gallery view");
                  return;
                }
                // Same-tab navigation, matching the dashboard's view button
                // (handleView in dashboard-client.tsx). The previous
                // `window.open(..., "_blank", "noopener")` got silently
                // swallowed by popup blockers in some browser configs.
                const slug = projectSlug || currentId;
                router.push(`/view/${encodeProjectId(slug)}`);
              }}
              aria-label="Open this project in the public viewer"
              style={{
                // Persona-aware: drive color via --fc-corner-context so the
                // button follows the active theme. Tailwind's /opacity
                // modifiers only work on @theme-config colors and resolve
                // to the static #a855f7, ignoring the persona override.
                color: "var(--fc-corner-context)",
                background:
                  "color-mix(in srgb, var(--fc-corner-context) 10%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--fc-corner-context) 40%, transparent)",
              }}
              className="w-full py-3 sm:py-3.5 text-sm sm:text-base font-medium rounded-xl transition-colors shadow-sm hover:shadow-md border flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fc-bg)] focus-visible:ring-[color:var(--fc-corner-context)]"
            >
              <Eye size={16} aria-hidden="true" />
              Preview Gallery View
            </button>
          </section>

          {/* Publish to Gallery */}
          <section id="publish" className="pt-2 scroll-mt-20" aria-label="Publish section">
            <button
              type="button"
              onClick={async () => {
                const currentId = useFourCornersStore.getState().projectId;
                if (!currentId) {
                  notify.info("Save your file first to publish to the gallery");
                  return;
                }
                try {
                  if (inGallery) {
                    await toggleGallery(currentId, false);
                    setInGallery(false);
                    notify.info("Unpublished from gallery");
                  } else {
                    if (!isPublished) {
                      await togglePublish(currentId, true);
                      setIsPublished(true);
                    }
                    await toggleGallery(currentId, true);
                    setInGallery(true);
                    notify.success("Published to gallery");
                  }
                  // Invalidate gallery caches so the change is visible immediately
                  fetch("/api/gallery/invalidate", { method: "POST" }).catch(() => {});
                  try { sessionStorage.removeItem("fc-gallery-cache"); } catch {}
                } catch (err) {
                  if (err instanceof Error && err.message === GALLERY_LIMIT_REACHED) {
                    notifyPublish.limitReached();
                    return;
                  }
                  notify.error(err instanceof Error ? err.message : "Failed to update gallery status");
                }
              }}
              aria-pressed={inGallery}
              className={`w-full py-3 sm:py-3.5 text-sm sm:text-base font-medium rounded-xl transition-colors shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fc-bg)] focus-visible:ring-white ${
                inGallery
                  ? "text-white bg-red-600 hover:bg-red-500"
                  : "text-white bg-corner-context hover:bg-corner-context/90"
              }`}
            >
              {inGallery ? "Unpublish from Gallery" : "Publish to Gallery"}
            </button>

            {/* Tag editor — visible when published to gallery */}
            {inGallery && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-muted">Gallery Tags</label>

                {/* Selected tags as dismissible pills */}
                {projectTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {projectTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                        style={{
                          background: "color-mix(in srgb, var(--fc-accent) 15%, transparent)",
                          color: "var(--fc-accent)",
                        }}
                      >
                        {displayTag(tag)}
                        <button
                          onClick={async () => {
                            const next = projectTags.filter((t) => t !== tag);
                            setProjectTags(next);
                            const currentId = useFourCornersStore.getState().projectId;
                            const { data: { session: s } } = await createClient().auth.getSession();
                            const userId = s?.user?.id;
                            if (currentId && userId) {
                              updateProjectTags(currentId, userId, next).catch(() => {});
                            }
                          }}
                          className="hover:opacity-70 transition-opacity"
                          aria-label={`Remove tag ${displayTag(tag)}`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Seed tag suggestions */}
                <div className="flex flex-wrap gap-1.5">
                  {SEED_TAGS.filter((t) => !projectTags.includes(t)).map((tag) => (
                    <button
                      key={tag}
                      onClick={async () => {
                        const next = normalizeTags([...projectTags, tag]);
                        setProjectTags(next);
                        const currentId = useFourCornersStore.getState().projectId;
                        const { data: { session: s } } = await createClient().auth.getSession();
                            const userId = s?.user?.id;
                        if (currentId && userId) {
                          updateProjectTags(currentId, userId, next).catch(() => {});
                        }
                      }}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer"
                      style={{
                        background: "var(--fc-wash)",
                        color: "var(--fc-text-muted)",
                      }}
                    >
                      + {displayTag(tag)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section id="export" className="pt-2 scroll-mt-20" aria-label="Export and import section">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setIsExportOpen(true)}
                className="w-full py-3 sm:py-3.5 text-sm sm:text-base font-medium text-gray-900 bg-corner-backstory hover:bg-corner-backstory/90 rounded-xl transition-colors shadow-sm hover:shadow-md"
                aria-label="Export fourcorners.js JSON metadata (Keyboard shortcut: Cmd+S)"
              >
                Export fourcorners.js JSON
              </button>
              <button
                onClick={() => setIsImportOpen(true)}
                style={{
                  // Persona-aware tint — same pattern as the gallery preview
                  // button; Tailwind /opacity modifiers ignore the persona
                  // override on corner colors.
                  color: "var(--fc-corner-backstory)",
                  background:
                    "color-mix(in srgb, var(--fc-corner-backstory) 10%, transparent)",
                  borderColor:
                    "color-mix(in srgb, var(--fc-corner-backstory) 40%, transparent)",
                }}
                className="w-full py-3 sm:py-3.5 text-sm sm:text-base font-medium rounded-xl transition-colors shadow-sm hover:shadow-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fc-bg)] focus-visible:ring-[color:var(--fc-corner-backstory)]"
                aria-label="Import metadata from a .json, .zip, or .html export (Keyboard shortcut: Cmd+I)"
              >
                Import
              </button>
            </div>
            <p
              className="text-center text-xs sm:text-sm text-gray-700 mt-3"
              aria-label="Keyboard shortcuts"
            >
              <kbd className="px-1.5 py-0.5 bg-surface rounded text-gray-500 font-mono text-xs">
                Cmd
              </kbd>
              +
              <kbd className="px-1.5 py-0.5 bg-surface rounded text-gray-500 font-mono text-xs">
                S
              </kbd>{" "}
              export
              <span className="mx-2 text-gray-500">·</span>
              <kbd className="px-1.5 py-0.5 bg-surface rounded text-gray-500 font-mono text-xs">
                Cmd
              </kbd>
              +
              <kbd className="px-1.5 py-0.5 bg-surface rounded text-gray-500 font-mono text-xs">
                I
              </kbd>{" "}
              import
            </p>
          </section>

          <MetadataInspector initiallyExpanded={viewingSharedProject} />
        </div>)}
      </div>

      <SectionProgress
        sections={[
          {
            id: "credit-ethics",
            label: "Authorship",
            color: "bg-corner-creativeCommons",
            ref: sectionRefs["credit-ethics"],
            isPopulated: Boolean(
              creativeCommons.copyright ||
              creativeCommons.description ||
              photographerInfo?.bio ||
              photographerInfo?.contact ||
              photographerInfo?.website,
            ),
          },
          {
            id: "backstory",
            label: "Backstory",
            color: "bg-corner-backstory",
            ref: sectionRefs["backstory"],
            isPopulated: Boolean(backStory.text),
          },
          {
            id: "context-images",
            label: "Related Imagery",
            color: "bg-corner-context",
            ref: sectionRefs["context-images"],
            isPopulated: context.length > 0,
          },
          {
            id: "links",
            label: "Links",
            color: "bg-corner-links",
            ref: sectionRefs["links"],
            isPopulated: links.length > 0,
          },
        ]}
      />

      <ScrollToTop />

      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

      <ImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      <SharedFileImportDialog
        isOpen={showSharedImportDialog}
        onClose={handleCancelImport}
        fileSlug={sharedFileData?.slug || ""}
        hasExistingFile={sharedFileData?.hasExisting || false}
        onConfirm={handleSharedFileImport}
        onCancel={handleViewSharedFile}
        isLoggedIn={isLoggedIn}
      />
    </div>
  );
}
