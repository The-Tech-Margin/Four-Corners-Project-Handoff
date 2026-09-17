"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import type { ProjectRecord } from "@/lib/db/projects";
import type { FourCornersContextItem, VoiceTranscription } from "@/lib/schema";
import { NORMALIZED_SELECT, buildMetadataFromNormalized, getAdjacentGalleryItems } from "@/lib/db/projects";
import { decodeProjectId, encodeProjectId } from "@/lib/encode-id";
import { sizedImageUrl, DISPLAY_WIDTH, DISPLAY_QUALITY } from "@/lib/image-url";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { FCPhotoViewer } from "@/components/viewer/fc-photo-viewer";
import { FCFullGallery } from "@/components/viewer/fc-full-gallery";
import { LoadingOverlay } from "@/components/loading-overlay";
import { Grid3X3, List, Share2 } from "lucide-react";
import { FCViewFAB } from "@/components/shared/fc-view-fab";
import { ShareModal } from "@/components/share-modal";
import { MetadataSummary } from "./components/MetadataSummary";
import { ContextImageCard } from "./components/ContextImageCard";
import { IIIFViewerTab } from "./components/IIIFViewerTab";
import {
  downloadFourCornersJSON,
  downloadIIIFManifest,
} from "@/lib/metadata-export";
import { notify } from "@/lib/notify";
import {
  refreshVoiceRecordingUrls,
  getVoiceRecordingSignedUrl,
} from "@/lib/supabase-voice-storage";
import { copyToClipboard } from "@/lib/clipboard";
import { transformToCanvasDocument } from "@/app/explore/[slug]/components/transform";

// Explore card list (SSR disabled — needs DOM). Renders inline as a tab.
const ExploreCanvas = dynamic(
  () =>
    import("@/app/explore/[slug]/components/ExploreCanvasVisx").then(
      (m) => m.ExploreCanvas,
    ),
  { ssr: false },
);

const VALID_TABS = ["main", "context", "iiif", "explore"] as const;
type TabType = (typeof VALID_TABS)[number];

export default function ViewProjectPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  // Initialize from URL params
  const initTab = VALID_TABS.includes(searchParams.get("tab") as TabType)
    ? (searchParams.get("tab") as TabType)
    : "main";

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(initTab);
  const [isOwnProject, setIsOwnProject] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // Global flag — when off, hide Explore mode from non-owner viewers
  // (toggle lives at /admin/settings). Default false (closed) until we get
  // a response, so we don't flash the affordance for non-owners.
  const [exploreEnabled, setExploreEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/gallery_explore_enabled")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setExploreEnabled(d?.value === true);
      })
      .catch(() => {
        /* fail closed */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [contextViewMode, setContextViewMode] = useState<"grid" | "list">("grid");
  const [isDesktop, setIsDesktop] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Sync active tab to URL — history.replaceState avoids React re-render
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab !== "main") {
      params.set("tab", activeTab);
    } else {
      params.delete("tab");
    }
    const qs = params.toString();
    const url = qs ? `/view/${slug}?${qs}` : `/view/${slug}`;
    window.history.replaceState(null, "", url);
  }, [activeTab, slug]);
  const [contextGalleryOpen, setContextGalleryOpen] = useState(false);
  const [contextGalleryIndex, setContextGalleryIndex] = useState(0);
  // Refreshed audio URLs for transcriptions and context items
  const [refreshedTranscriptions, setRefreshedTranscriptions] = useState<VoiceTranscription[] | null>(null);
  const [refreshedContextImages, setRefreshedContextImages] = useState<FourCornersContextItem[] | null>(null);

  // Explore tab — the card-list canvas tracks the active dark/light mode.
  const [colorMode, setColorMode] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const el = document.documentElement;
    const sync = () =>
      setColorMode(el.classList.contains("light") ? "light" : "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Canvas document for the Explore tab — built lazily when the tab is
  // active, with refreshed audio/context URLs patched in so voice cards play.
  const exploreDoc = useMemo(() => {
    if (activeTab !== "explore" || !project) return null;
    const patched: ProjectRecord = {
      ...project,
      metadata: {
        ...project.metadata,
        voiceTranscriptions:
          refreshedTranscriptions ?? project.metadata?.voiceTranscriptions,
        context: refreshedContextImages ?? project.metadata?.context,
      },
    };
    // "vertical" = the card-list layout, now the single explore presentation.
    return transformToCanvasDocument(patched, "vertical", colorMode, {
      fullContent: true,
    });
  }, [activeTab, project, refreshedTranscriptions, refreshedContextImages, colorMode]);
  // Adjacent gallery items for swipe navigation
  const [adjacentItems, setAdjacentItems] = useState<{
    prev: { id: string; slug: string | null; main_image_url: string | null } | null;
    next: { id: string; slug: string | null; main_image_url: string | null } | null;
  }>({ prev: null, next: null });
  // Touch tracking for swipe gestures
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipeContainerRef = useRef<HTMLDivElement>(null);

  const handleBack = useCallback(() => {
    router.push(isOwnProject ? "/dashboard" : "/gallery");
  }, [router, isOwnProject]);

  useEffect(() => {
    // Try sessionStorage cache for instant render
    try {
      const cached = sessionStorage.getItem(`fc-view-${slug}`);
      if (cached) {
        const data = JSON.parse(cached) as ProjectRecord;
        setProject(data);
        setLoading(false);
      }
    } catch { /* ignore */ }
    loadProject();
  }, [slug]);

  const loadProject = async () => {
    try {
      const decodedSlug = decodeProjectId(slug);
      const supabase = createClient();

      // Check user authentication
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);

      // Check if decoded value is a UUID (36 chars with hyphens at specific positions)
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isUuid = uuidRegex.test(decodedSlug);

      // For logged-in users viewing their own projects, don't require published
      // For public access, require published = true
      const buildQuery = (select: string) => {
        let q = supabase.from("projects").select(select);
        if (!user) q = q.eq("published", true);
        return isUuid ? q.eq("id", decodedSlug) : q.eq("slug", decodedSlug);
      };

      let { data, error } = await buildQuery(NORMALIZED_SELECT);
      if (error?.message?.includes("main_image_thumbnail_path") || error?.code === "42703") {
        // Migration 041 fallback — strip the new column and retry.
        const fallbackSelect = NORMALIZED_SELECT
          .replace(",main_image_thumbnail_path", "")
          .replace("main_image_thumbnail_path,", "");
        ({ data, error } = await buildQuery(fallbackSelect));
      }

      if (error) {
        throw new Error("Failed to load project. Please try again later.");
      }

      if (!data || data.length === 0) {
        throw new Error("Project not found or has been unpublished");
      }

      const projectData = buildMetadataFromNormalized(data[0]);

      // Check if user owns this project
      const ownsProject = user && projectData.user_id === user.id;
      setIsOwnProject(ownsProject);

      // If not owner and not published, deny access
      if (!ownsProject && !projectData.published) {
        throw new Error("This project is private");
      }

      setProject(projectData);

      // Cache for instant render on back/forward navigation
      try {
        sessionStorage.setItem(`fc-view-${slug}`, JSON.stringify(projectData));
      } catch { /* quota — skip */ }

      // Fetch adjacent gallery items for swipe navigation (non-blocking)
      if (projectData.in_gallery && projectData.published) {
        getAdjacentGalleryItems(projectData.id).then(setAdjacentItems);
      }

      // Refresh audio URLs for voice transcriptions
      const transcriptions = projectData.metadata?.voiceTranscriptions;
      if (transcriptions && transcriptions.length > 0) {
        refreshVoiceRecordingUrls(transcriptions).then(setRefreshedTranscriptions);
      }

      // Resolve missing image/audio URLs for context items
      const contextItems = projectData.metadata?.context;
      if (contextItems && contextItems.length > 0) {
        const needsResolution = contextItems.some(
          (item: FourCornersContextItem) =>
            (item.storage_path && !item.storage_url) ||
            (item.audioStoragePath && !item.audioStorageUrl)
        );
        if (needsResolution) {
          const supabaseClient = createClient();
          Promise.all(
            contextItems.map(async (item: FourCornersContextItem) => {
              const patch: Partial<FourCornersContextItem> = {};
              // Resolve image storage_path → public URL
              if (item.storage_path && !item.storage_url) {
                const { data } = supabaseClient.storage
                  .from("context-media")
                  .getPublicUrl(item.storage_path);
                if (data?.publicUrl) {
                  patch.storage_url = data.publicUrl;
                  patch.src = data.publicUrl;
                }
              }
              // Resolve thumbnail storage_path → public URL
              if (item.thumbnail_storage_path && !item.thumbnail_storage_url) {
                const { data } = supabaseClient.storage
                  .from("context-media")
                  .getPublicUrl(item.thumbnail_storage_path);
                if (data?.publicUrl) {
                  patch.thumbnail_storage_url = data.publicUrl;
                  patch.thumbnailDataUrl = data.publicUrl;
                }
              }
              // Resolve audio storage path → signed URL
              if (item.audioStoragePath && !item.audioStorageUrl) {
                const url = await getVoiceRecordingSignedUrl(item.audioStoragePath);
                if (url) patch.audioStorageUrl = url;
              }
              return Object.keys(patch).length > 0 ? { ...item, ...patch } : item;
            })
          ).then(setRefreshedContextImages);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Navigate to adjacent gallery item
  const navigateTo = useCallback(
    (item: { id: string; slug: string | null } | null) => {
      if (!item) return;
      const targetSlug = item.slug && item.slug.trim() ? item.slug : item.id;
      router.push(`/view/${encodeProjectId(targetSlug)}`);
    },
    [router],
  );

  const goToPrev = useCallback(() => navigateTo(adjacentItems.prev), [adjacentItems.prev, navigateTo]);
  const goToNext = useCallback(() => navigateTo(adjacentItems.next), [adjacentItems.next, navigateTo]);

  // Touch swipe handling for mobile gallery navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const dt = Date.now() - touchStartRef.current.time;
      touchStartRef.current = null;

      // Only register horizontal swipes: must be mostly horizontal and fast enough
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7 || dt > 500) return;

      // Don't swipe when a panel is open (corner panel interactions)
      const panelOpen = document.querySelector(".fc-panel.fc-active");
      if (panelOpen) return;

      if (dx < 0 && adjacentItems.next) {
        goToNext();
      } else if (dx > 0 && adjacentItems.prev) {
        goToPrev();
      }
    },
    [adjacentItems, goToNext, goToPrev],
  );

  // Keyboard navigation (arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Don't navigate when a panel is open (corner navigation handles arrows instead)
      const panelOpen = document.querySelector(".fc-panel.fc-active");
      if (panelOpen) return;

      if (e.key === "ArrowLeft" && adjacentItems.prev) {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight" && adjacentItems.next) {
        e.preventDefault();
        goToNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [adjacentItems, goToPrev, goToNext]);

  // --- Early returns (after all hooks) ---

  if (loading) {
    return (
      <div className="min-h-screen bg-surface">
        <LoadingOverlay isLoading={true} text="Loading project..." />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-red-500 mb-2">Project not found</p>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <Link
            href={isLoggedIn ? "/dashboard" : "/gallery"}
            className="inline-block px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-lg transition-colors"
          >
            {isLoggedIn ? "Back to My Files" : "Browse Gallery"}
          </Link>
        </div>
      </div>
    );
  }

  const metadata = project.metadata;
  // Use refreshed context images and transcriptions if available (for audio URL refresh)
  const contextImages = refreshedContextImages || metadata.context || [];
  const voiceTranscriptions = refreshedTranscriptions || metadata.voiceTranscriptions || [];

  // Share handler — opens the internal ShareModal so authenticated users
  // can copy + send to collaborators (matches editor behavior). The
  // public URL includes the current tab for deep linking.
  const shareUrl = (() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    const params = new URLSearchParams();
    if (activeTab !== "main") params.set("tab", activeTab);
    const qs = params.toString();
    return qs ? `${origin}/view/${slug}?${qs}` : `${origin}/view/${slug}`;
  })();
  const handleShare = () => {
    setShowShareModal(true);
  };

  // Edit handler
  const handleEdit = () => {
    router.push(`/?project=${project.id}`);
  };

  // Download JSON handler
  const handleDownloadJSON = async () => {
    await downloadFourCornersJSON(project);
    notify.success("Four Corners JSON downloaded");
  };

  // Download IIIF handler
  const handleDownloadIIIF = () => {
    downloadIIIFManifest(project);
    notify.success("IIIF manifest downloaded");
  };

  return (
    <div className="min-h-screen bg-surface fc-view-page">
      {/* Global App Header with view actions */}
      <AppHeader
        viewActions={{
          onShare: handleShare,
          onEdit: isOwnProject ? handleEdit : undefined,
          onDownloadJSON: isOwnProject ? handleDownloadJSON : undefined,
          onDownloadIIIF: isOwnProject && project.main_image_url ? handleDownloadIIIF : undefined,
          isOwnProject,
        }}
      />
      {/* Spacer for fixed header */}
      <div className="h-16 sm:h-18" />

      {/* Breadcrumb — always visible back to gallery + share */}
      <div className="fc-view-breadcrumb">
        <Link
          href={isOwnProject ? "/dashboard" : "/gallery"}
          className="fc-view-breadcrumb__link"
        >
          ← {isOwnProject ? "Dashboard" : "Gallery"}
        </Link>
        {project.title && (
          <>
            <span className="fc-view-breadcrumb__sep">/</span>
            <span className="fc-view-breadcrumb__current">{project.title}</span>
          </>
        )}
        <button
          onClick={async () => {
            const url = window.location.href;
            if (navigator.share) {
              // User-cancel rejects with AbortError; swallow it (and any
              // permission errors) so it doesn't bubble up as an unhandled
              // promise rejection.
              navigator.share({ url }).catch(() => {});
              return;
            }
            const ok = await copyToClipboard(url);
            if (ok) notify.success("Link copied");
            else notify.error("Could not copy link");
          }}
          className="fc-view-breadcrumb__share"
          aria-label="Share this view"
          title="Copy link"
        >
          <Share2 size={12} />
        </button>
      </div>

      {/* Content - Four Corners viewer is primary, no sticky toolbar overlapping it */}
      <main
        ref={swipeContainerRef}
        className="fc-view-main w-full px-0 sm:px-6 2xl:px-10 pt-0 pb-1 sm:pt-1 sm:pb-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Image viewer — stays mounted across 4C / IIIF tabs always, and across
            the context tab as well on desktop so the image remains in view while
            the user browses related media. */}
        {(activeTab === "main" ||
          activeTab === "iiif" ||
          (activeTab === "context" && isDesktop)) &&
          project.main_image_url && (
          <>
            <FCPhotoViewer
              imageSrc={project.main_image_url}
              displaySrc={
                sizedImageUrl(project.main_image_url, {
                  width: DISPLAY_WIDTH,
                  quality: DISPLAY_QUALITY,
                }) ?? undefined
              }
              placeholderSrc={project.main_image_thumbnail_url ?? undefined}
              imageAlt={
                metadata.creativeCommons?.description ||
                "Four Corners photograph"
              }
              data={{
                authorship: {
                  caption: metadata.creativeCommons?.description,
                  credit: metadata.creativeCommons?.copyright,
                  author: metadata.backStory?.author,
                  ethics: metadata.ethics,
                  photographerInfo: metadata.photographerInfo,
                },
                backstory: metadata.backStory || {
                  text: "",
                  author: "",
                  publication: "",
                  publicationUrl: "",
                  date: "",
                },
                imagery: contextImages,
                links: metadata.links || [],
                location: metadata.location,
                photoMetadata: metadata.photoMetadata,
                voiceTranscriptions,
                title: project.title?.trim() || undefined,
                date:
                  metadata.photoMetadata?.dateTaken ||
                  metadata.backStory?.date ||
                  project.date ||
                  undefined,
              }}
              options={{
                showCutline: activeTab === "main",
              }}
              className="max-w-6xl 2xl:max-w-7xl mx-auto"
              projectContext={{
                projectId: project.id,
                projectSlug: project.slug || undefined,
              }}
              readOnly={!isOwnProject}
              cornerAnimationKey={activeTab}
            />

            {/* Mobile metadata summary — key info at a glance below cutline (4C tab only) */}
            {activeTab === "main" && <MetadataSummary metadata={metadata} />}
          </>
        )}

        {/* Navigation — on desktop, flows inline here between image and sections.
            On mobile, stays fixed bottom-right via CSS. */}
        <FCViewFAB
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onBack={handleBack}
          onPrev={goToPrev}
          onNext={goToNext}
          hasPrev={!!adjacentItems.prev}
          hasNext={!!adjacentItems.next}
          hasIIIF={!!project.main_image_url}
          contextCount={contextImages.length}
          showExplore={isOwnProject || exploreEnabled}
        />

        {/* IIIF metadata panels — rendered below the shared image */}
        {activeTab === "iiif" && project.main_image_url && (
          <IIIFViewerTab metadata={metadata} />
        )}

        {/* Explore — the card-list connections view, inline like IIIF/Related.
            Gated like the tab button: owners always, others only when the
            gallery_explore_enabled flag is on (covers direct ?tab=explore URLs). */}
        {activeTab === "explore" && (isOwnProject || exploreEnabled) && exploreDoc && (
          <div className="max-w-7xl 2xl:max-w-[90rem] mx-auto px-4">
            <ExploreCanvas document={exploreDoc} colorMode={colorMode} />
          </div>
        )}

        {activeTab === "context" && (
          <div className="max-w-7xl 2xl:max-w-[90rem] mx-auto px-4">
            {/* Related Images Header with view toggle */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-corner-context"></div>
                <h2 className="text-lg font-semibold fc-view-heading">
                  Related Images
                </h2>
                <span className="px-2 py-0.5 text-xs bg-corner-context/20 text-corner-context rounded-full">
                  {contextImages.length}
                </span>
              </div>
              {/* Grid/List toggle - reuses dashboard pattern */}
              <div className="dashboard-toolbar__view-toggle">
                <button
                  onClick={() => setContextViewMode("grid")}
                  className={`dashboard-toolbar__view-btn ${contextViewMode === "grid" ? "dashboard-toolbar__view-btn--active" : ""}`}
                  aria-label="Grid view"
                >
                  <Grid3X3 size={16} />
                </button>
                <button
                  onClick={() => setContextViewMode("list")}
                  className={`dashboard-toolbar__view-btn ${contextViewMode === "list" ? "dashboard-toolbar__view-btn--active" : ""}`}
                  aria-label="List view"
                >
                  <List size={16} />
                </button>
              </div>
            </div>

            {/* Grid View */}
            {contextViewMode === "grid" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {contextImages.map((item: FourCornersContextItem, index: number) => (
                  <ContextImageCard
                    key={item.id || index}
                    item={item}
                    index={index}
                    metadata={{ ...metadata, voiceTranscriptions }}
                    layout="grid"
                    onImageClick={() => {
                      setContextGalleryIndex(index);
                      setContextGalleryOpen(true);
                    }}
                  />
                ))}
              </div>
            )}

            {/* List View */}
            {contextViewMode === "list" && (
              <div className="space-y-2">
                {contextImages.map((item: FourCornersContextItem, index: number) => (
                  <ContextImageCard
                    key={item.id || index}
                    item={item}
                    index={index}
                    metadata={{ ...metadata, voiceTranscriptions }}
                    layout="list"
                    onImageClick={() => {
                      setContextGalleryIndex(index);
                      setContextGalleryOpen(true);
                    }}
                  />
                ))}
              </div>
            )}

            {/* Lightbox gallery */}
            <FCFullGallery
              data={contextImages}
              isOpen={contextGalleryOpen}
              initialIndex={contextGalleryIndex}
              onClose={() => setContextGalleryOpen(false)}
              onBackToCorner={() => setContextGalleryOpen(false)}
              mainImageSrc={project.main_image_url || undefined}
              projectContext={{
                projectId: project.id,
                projectSlug: project.slug || undefined,
                voiceTranscriptions,
              }}
              readOnly={!isOwnProject}
            />
          </div>
        )}


      </main>

      {/* Share modal — matches the editor's internal share flow so an
          authenticated viewer can copy the public link or send it via
          email/social. Other authenticated users can then open the link
          and either view or duplicate the file from there. */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={shareUrl}
        fileSlug={project.slug || slug}
        isPublished={project.published}
      />
    </div>
  );
}

