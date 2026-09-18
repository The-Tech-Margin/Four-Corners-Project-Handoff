"use client";

import { useEffect, useState, useMemo, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProjectRecord } from "@/lib/projects/types";
import { AppHeader } from "@/components/app-header";
import { LoadingOverlay } from "@/components/loading-overlay";
import Link from "next/link";
import { encodeProjectId } from "@/lib/encode-id";
import { FCProjectGrid } from "@/components/shared/fc-project-grid";
import { FCProjectList } from "@/components/shared/fc-project-list";
import { Search, X, Loader2 } from "lucide-react";
import { displayTag } from "@/lib/tags";
import { notifyClipboard } from "@/lib/notify";
import { useAccess } from "@/components/access-provider";
import {
  FCViewControls,
  type ViewMode,
  type SortOption,
} from "@/components/shared/fc-view-controls";
import { buildSearchIndex, searchProjects } from "@/lib/search-projects";
import type { ImageSet } from "@/lib/gallery-utils";

const SEARCH_DEBOUNCE_MS = 300;

/* ── Skeleton card for loading state ── */
function SkeletonCard() {
  return (
    <div className="fc-card">
      <div className="fc-card__image-container">
        <div
          className="animate-pulse"
          style={{
            aspectRatio: "4/3",
            background: "var(--fc-surface-alt, #1a1a1a)",
            borderRadius: 4,
          }}
        />
      </div>
      <div className="fc-card__metadata">
        <div
          className="animate-pulse"
          style={{
            height: 12,
            width: "75%",
            background: "var(--fc-surface-alt, #1a1a1a)",
            borderRadius: 4,
            marginBottom: 8,
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <div
            className="animate-pulse"
            style={{
              height: 10,
              width: "30%",
              background: "var(--fc-surface-alt, #1a1a1a)",
              borderRadius: 4,
            }}
          />
          <div
            className="animate-pulse"
            style={{
              height: 10,
              width: "20%",
              background: "var(--fc-surface-alt, #1a1a1a)",
              borderRadius: 4,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SkeletonGrid({ columns }: { columns: number }) {
  const count = columns * 2; // 2 rows of skeletons
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 16,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/* skeleton → loaded; error surfaces the retry UI. */
type LoadPhase = "skeleton" | "loaded" | "error";

const PAGE_SIZE = 24;
const CACHE_KEY = "fc-gallery-cache";

const VALID_VIEWS: ViewMode[] = ["grid", "list"];
const VALID_SORTS: SortOption[] = [
  "random",
  "newest",
  "oldest",
  "name-asc",
  "name-desc",
];

function GalleryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from URL params
  const initView = VALID_VIEWS.includes(searchParams.get("view") as ViewMode)
    ? (searchParams.get("view") as ViewMode)
    : "grid";
  // Default sort is "random" — the gallery feels fresh on each visit.
  // Other sorts (newest, oldest, name) are opt-in via the URL or the sort
  // dropdown. "random" is not persisted to the URL (see sync effect below)
  // so reloading the page reshuffles without the user having to reset.
  const initSort = VALID_SORTS.includes(searchParams.get("sort") as SortOption)
    ? (searchParams.get("sort") as SortOption)
    : "random";
  const initSearch = searchParams.get("q") || "";
  const initTags = searchParams.getAll("tag");

  const [imageSets, setImageSets] = useState<ImageSet[]>([]);
  const [phase, setPhase] = useState<LoadPhase>("skeleton");
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState(1);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initSearch);
  const [viewMode, setViewMode] = useState<ViewMode>(initView);
  const [sortOption, setSortOption] = useState<SortOption>(initSort);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set(initTags));
  const [serverSearchResults, setServerSearchResults] = useState<ProjectRecord[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Sync layout state to URL params — use history.replaceState to avoid
  // React re-renders from router.replace (which triggers useSearchParams update)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const params = new URLSearchParams();
    if (viewMode !== "grid") params.set("view", viewMode);
    // Persist any sort except "random" (the default + non-deterministic).
    // Leaving random out of the URL means reload = reshuffle.
    if (sortOption !== "random") params.set("sort", sortOption);
    if (searchQuery) params.set("q", searchQuery);
    for (const tag of activeTags) params.append("tag", tag);
    const qs = params.toString();
    const url = qs ? `/gallery?${qs}` : "/gallery";
    window.history.replaceState(null, "", url);
  }, [viewMode, sortOption, searchQuery, activeTags]);

  // Server-side search — debounced, falls back to client-side on error
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setServerSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=100&semantic=true`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const sets: ImageSet[] = await res.json();
        setServerSearchResults(sets.map((s) => s.root));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Fall back to client-side search — don't show error
          console.warn("Server search failed, using client-side fallback:", err);
          setServerSearchResults(null);
        }
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const hasFetchedRef = useRef(false);
  const dataReadyRef = useRef(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleViewProject = useCallback((project: ProjectRecord) => {
    const linkSlug = project.slug && project.slug.trim() ? project.slug : project.id;
    const encodedSlug = encodeProjectId(linkSlug);
    router.push(`/view/${encodedSlug}`);
  }, [router]);

  const handleShareProject = useCallback((project: ProjectRecord) => {
    const linkSlug = project.slug && project.slug.trim() ? project.slug : project.id;
    const encodedSlug = encodeProjectId(linkSlug);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/share/${encodedSlug}`;

    if (navigator.share) {
      navigator.share({ url: shareUrl, title: project.title || "Four Corners" }).catch(() => {});
    } else {
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => notifyClipboard.linkCopied())
        .catch(() => notifyClipboard.failed());
    }
  }, []);

  // Auth comes from the app-wide provider — no second subscription here.
  const { user } = useAccess();
  useEffect(() => {
    setIsLoggedIn(!!user);
  }, [user]);

  // Responsive columns — only update state when column count truly changes
  // to avoid re-rendering the masonry grid when mobile browser chrome hides/shows
  useEffect(() => {
    const getColumns = () => {
      const width = window.innerWidth;
      if (width < 640) return 1;
      if (width < 1024) return 2;
      return 3;
    };

    setColumns(getColumns());

    const handleResize = () => {
      const next = getColumns();
      setColumns((prev) => (prev === next ? prev : next));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadGalleryImageSets = useCallback(async (append = false) => {
    if (!append) {
      setError(null);
      dataReadyRef.current = false;
    }
    try {
      const offset = append ? offsetRef.current : 0;
      const res = await fetch(`/api/gallery?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Gallery request failed (${res.status})`);
      }
      const sets: ImageSet[] = await res.json();
      if (!append) {
        setImageSets(sets || []);
        offsetRef.current = (sets || []).length;
        // Cache first page for instant repeat visits
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(sets || []));
        } catch { /* quota exceeded — skip */ }
      } else {
        setImageSets((prev) => [...prev, ...(sets || [])]);
        offsetRef.current += (sets || []).length;
      }
      setHasMore((sets || []).length >= PAGE_SIZE);
      dataReadyRef.current = true;
      setPhase("loaded");
    } catch (err) {
      console.error("Failed to load gallery image sets:", err);
      if (!append) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setPhase("error");
      }
    } finally {
      setLoadingMore(false);
    }
  }, []);

  // Load more when sentinel enters viewport
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    loadGalleryImageSets(true);
  }, [loadingMore, hasMore, loadGalleryImageSets]);

  // Fetch gallery data — show cached first, then refresh
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    // Try sessionStorage cache for instant render
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const sets = JSON.parse(cached) as ImageSet[];
        if (sets.length > 0) {
          setImageSets(sets);
          offsetRef.current = sets.length;
          dataReadyRef.current = true;
          setPhase("loaded");
        }
      }
    } catch { /* parse error — ignore */ }

    // Always fetch fresh data (replaces cache)
    loadGalleryImageSets();
  }, [loadGalleryImageSets]);

  // Infinite scroll — observe sentinel at bottom of list
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Flatten image sets to projects — stable reference via useMemo
  const allProjects = useMemo(() => imageSets.map((set) => set.root), [imageSets]);
  const searchIndex = useMemo(() => buildSearchIndex(allProjects), [allProjects]);

  // Use server results when available, fall back to client-side search
  const searchedProjects = useMemo(() => {
    if (serverSearchResults) return serverSearchResults;
    return searchProjects(allProjects, searchQuery, searchIndex);
  }, [serverSearchResults, allProjects, searchQuery, searchIndex]);

  // Extract all unique tags across gallery items (for pill rendering)
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const p of allProjects) {
      if (p.tags) for (const t of p.tags) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [allProjects]);

  // Apply tag filters — project must have ANY active tag (OR logic)
  const filteredProjects = useMemo(() => {
    if (activeTags.size === 0) return searchedProjects;
    return searchedProjects.filter((p) => {
      if (!p.tags || p.tags.length === 0) return false;
      for (const tag of activeTags) {
        if (p.tags.includes(tag)) return true;
      }
      return false;
    });
  }, [searchedProjects, activeTags]);

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const clearTags = useCallback(() => setActiveTags(new Set()), []);

  // Random-sort cache. Each project id gets a random key the first time
  // it's sorted, and keeps that key for the rest of the page session. This
  // gives a stable "shuffled" order even as more pages stream in from the
  // paginated API — newly-loaded projects slot in without the already-seen
  // ones jumping around. The ref is fresh on every mount, so navigating
  // away and back (or reloading) reshuffles.
  const randomKeysRef = useRef(new Map<string, number>());

  // Pre-compute created_at timestamps so sort comparators don't allocate
  // Date objects per comparison.
  const projectsWithTs = useMemo(
    () => filteredProjects.map((p) => ({ p, ts: p.created_at ? Date.parse(p.created_at) : 0 })),
    [filteredProjects],
  );

  // Apply sort — memoized so it only re-runs when inputs change
  const projects = useMemo(() => {
    if (sortOption === "random") {
      const keys = randomKeysRef.current;
      const base = filteredProjects.slice();
      for (const p of base) {
        if (!keys.has(p.id)) keys.set(p.id, Math.random());
      }
      return base.sort((a, b) => (keys.get(a.id) ?? 0) - (keys.get(b.id) ?? 0));
    }
    const sorted = projectsWithTs.slice();
    switch (sortOption) {
      case "oldest":
        sorted.sort((a, b) => a.ts - b.ts);
        break;
      case "name-asc":
        sorted.sort((a, b) => (a.p.title || a.p.slug || "").localeCompare(b.p.title || b.p.slug || ""));
        break;
      case "name-desc":
        sorted.sort((a, b) => (b.p.title || b.p.slug || "").localeCompare(a.p.title || a.p.slug || ""));
        break;
      case "newest":
      default:
        sorted.sort((a, b) => b.ts - a.ts);
        break;
    }
    return sorted.map((x) => x.p);
  }, [filteredProjects, projectsWithTs, sortOption]);

  const isLoading = phase === "skeleton";

  /* ── Error state ── */
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-surface">
        <AppHeader />
        <div className="h-14 sm:h-16" />
        <div
          className="flex items-center justify-center"
          style={{ minHeight: "calc(100vh - 120px)" }}
        >
          <div className="text-center">
            <p className="text-red-500 mb-2">Failed to load gallery</p>
            <p className="text-gray-400 text-sm mb-4">{error}</p>
            <button
              onClick={() => {
                setPhase("skeleton");
                dataReadyRef.current = false;
                hasFetchedRef.current = false;
                loadGalleryImageSets();
              }}
              className="px-5 py-2 bg-accent hover:bg-accent-dark text-white rounded-lg text-sm font-medium transition-all active:scale-95"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Skeleton + Loaded phases: page shell always visible ── */
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      {/* Spacer for fixed header */}
      <div className="h-14 sm:h-16" />

      <main id="gallery" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 scroll-mt-20">
        {/* Search */}
        <div className="block mb-2">
          <div className="input-icon-wrapper has-icon-left has-icon-right flex w-full">
            <span className="input-icon-left">
              <Search size={18} />
            </span>
            <input
              type="text"
              placeholder="Search gallery..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isLoading}
            />
            {searchQuery && (
              <span className="input-icon-right">
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Results count + controls row */}
        <div className="flex items-start justify-between mb-3 sm:mb-4">
          <div>
            <p className="text-xs" aria-live="polite" aria-atomic="true" style={{ color: "var(--fc-text-muted)", margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
              {isLoading
                ? "Loading..."
                : isSearching
                  ? <><Loader2 size={12} className="animate-spin" /> Searching...</>
                  : `${projects.length} ${projects.length === 1 ? "result" : "results"}`
              }
            </p>
            {/* Active tag pills — wrap under results count */}
            {activeTags.size > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 0 }}>
                {Array.from(activeTags).map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 18,
                      fontSize: 10,
                      fontWeight: 500,
                      lineHeight: 1,
                      padding: "0 0 0 4px",
                      letterSpacing: "-0.01em",
                      background: "color-mix(in srgb, var(--fc-accent) 12%, transparent)",
                      color: "var(--fc-accent)",
                      border: "1px solid color-mix(in srgb, var(--fc-accent) 25%, transparent)",
                      borderRadius: "var(--radius)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayTag(tag)}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleTag(tag)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleTag(tag); }}
                      aria-label={`Remove ${displayTag(tag)} filter`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 10,
                        height: 10,
                        margin: "0 1px 0 2px",
                        borderRadius: "50%",
                        cursor: "pointer",
                        opacity: 0.6,
                      }}
                    >
                      <X size={6} strokeWidth={3} />
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <FCViewControls
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortOption={sortOption}
            onSortChange={setSortOption}
            availableTags={availableTags}
            activeTags={activeTags}
            onTagToggle={toggleTag}
            onTagsClear={clearTags}
          />
        </div>

        {/* Skeleton phase: show placeholder cards */}
        {phase === "skeleton" && (
          <div
            className="fc-gallery-fade-in"
            role="status"
            aria-busy="true"
            aria-label="Loading projects"
            style={{ animation: "fc-gallery-fade-in 200ms ease forwards" }}
          >
            <SkeletonGrid columns={columns} />
          </div>
        )}

        {/* Loaded phase: real content */}
        {phase === "loaded" && (
          <div
            className="fc-gallery-fade-in"
            style={{ animation: "fc-gallery-fade-in 300ms ease forwards" }}
          >
            {projects.length === 0 ? (
              <div className="text-center py-12 sm:py-16 px-4">
                <p className="text-muted text-base sm:text-lg mb-4">
                  {searchQuery
                    ? `No results found for "${searchQuery}"`
                    : "No published files yet. Be the first to share!"}
                </p>
                {!searchQuery && (
                  <Link
                    href="/"
                    className="inline-block px-6 py-3 bg-accent hover:bg-accent-dark active:scale-95 text-white rounded-lg transition-all touch-manipulation"
                  >
                    Create a File
                  </Link>
                )}
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="inline-block px-6 py-3 bg-surface-alt hover:bg-surface border border-border text-foreground rounded-lg transition-all touch-manipulation"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : viewMode === "list" ? (
              <FCProjectList
                projects={projects}
                mode="gallery"
                onView={handleViewProject}
                onShare={handleShareProject}
                emptyState={
                  <div className="text-center py-12 sm:py-16 px-4">
                    <p className="text-muted text-base sm:text-lg mb-4">
                      No published files yet. Be the first to share!
                    </p>
                    <Link
                      href="/"
                      className="inline-block px-6 py-3 bg-accent hover:bg-accent-dark active:scale-95 text-white rounded-lg transition-all touch-manipulation"
                    >
                      Create a File
                    </Link>
                  </div>
                }
              />
            ) : (
              <FCProjectGrid
                projects={projects}
                direction="masonry"
                columns={columns}
                mode="gallery"
                onShare={handleShareProject}
                cardProps={{
                  showCaption: true,
                  showBackstory: true,
                  showAuthor: true,
                  showDate: true,
                  showCornerIndicators: true,
                }}
                emptyState={
                  <div className="text-center py-12 sm:py-16 px-4">
                    <p className="text-muted text-base sm:text-lg mb-4">
                      No published files yet. Be the first to share!
                    </p>
                    <Link
                      href="/"
                      className="inline-block px-6 py-3 bg-accent hover:bg-accent-dark active:scale-95 text-white rounded-lg transition-all touch-manipulation"
                    >
                      Create a File
                    </Link>
                  </div>
                }
              />
            )}

            {/* Infinite scroll sentinel — disabled during search (results are pre-ranked) */}
            {hasMore && !searchQuery.trim() && (
              <div
                ref={sentinelRef}
                style={{ height: 1, marginTop: 16 }}
                aria-hidden="true"
              />
            )}
            {loadingMore && (
              <div className="flex justify-center py-6">
                <div
                  className="w-6 h-6 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: "var(--fc-border)",
                    borderTopColor: "var(--fc-accent)",
                  }}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating "+" button for logged-in users */}
      {isLoggedIn && (
        <Link
          href="/?new=true"
          className="fc-gallery-fab"
          aria-label="Create new file"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </Link>
      )}
    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface"><LoadingOverlay isLoading={true} /></div>}>
      <GalleryPageInner />
    </Suspense>
  );
}
