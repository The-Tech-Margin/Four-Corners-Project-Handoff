/**
 * Dashboard Client Component
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */
"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { notify, notifyFile } from "@/lib/notify";
import Link from "next/link";
import {
  deleteProject,
  togglePublish,
  type ProjectRecord,
} from "@/lib/db/projects";
import { AppHeader } from "@/components/app-header";
import { LoadingOverlay } from "@/components/loading-overlay";
import { DownloadModal } from "@/components/dashboard/DownloadModal";
import { ShareModal } from "@/components/dashboard/ShareModal";
import { downloadFourCornersJSON } from "@/lib/metadata-export";

import { FCProjectGrid } from "@/components/shared/fc-project-grid";
import { FCProjectList } from "@/components/shared/fc-project-list";
import { encodeProjectId } from "@/lib/encode-id";
import { Search, X, Trash2 } from "lucide-react";
import {
  FCViewControls,
  type ViewMode,
  type SortOption,
  type FilterOption,
} from "@/components/shared/fc-view-controls";
import { buildSearchIndex, searchProjects } from "@/lib/search-projects";

type ScrollDirection = "vertical" | "horizontal";

function formatBytes(bytes: number) {
  if (typeof bytes !== "number" || isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


interface DashboardClientProps {
  projects: ProjectRecord[];
  storageUsed: number;
  storageLimit: number;
  userEmail: string;
}

export function DashboardClient({
  projects: initialProjects,
  storageUsed,
  storageLimit,
  userEmail,
}: DashboardClientProps) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [columns, setColumns] = useState(2);
  const [shareProject, setShareProject] = useState<ProjectRecord | null>(null);
  const [downloadProject, setDownloadProject] = useState<ProjectRecord | null>(
    null,
  );
  const [deleteConfirmProject, setDeleteConfirmProject] =
    useState<ProjectRecord | null>(null);

  // Fetch projects via API route with pagination
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const dashOffsetRef = useRef(0);
  const dashSentinelRef = useRef<HTMLDivElement>(null);
  const dashPageSize = 24;

  useEffect(() => {
    if (initialProjects.length > 0) {
      setProjects(initialProjects);
      dashOffsetRef.current = initialProjects.length;
      setHasMore(initialProjects.length >= dashPageSize);
      setLoading(false);
      return;
    }

    async function loadProjects() {
      try {
        const res = await fetch(`/api/projects?limit=${dashPageSize}&offset=0`);
        if (!res.ok) {
          if (res.status === 401) { setLoading(false); return; }
          throw new Error(`Failed to load projects (${res.status})`);
        }
        const { projects: result } = await res.json();
        setProjects(result || []);
        dashOffsetRef.current = (result || []).length;
        setHasMore((result || []).length >= dashPageSize);
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProjects();
  }, [initialProjects]);

  const loadMoreDash = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/projects?limit=${dashPageSize}&offset=${dashOffsetRef.current}`);
      if (!res.ok) throw new Error(`Failed to load more projects (${res.status})`);
      const { projects: result } = await res.json();
      setProjects((prev) => [...prev, ...(result || [])]);
      dashOffsetRef.current += (result || []).length;
      setHasMore((result || []).length >= dashPageSize);
    } catch (err) {
      console.error("Failed to load more projects:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMore]);

  // Infinite scroll observer for dashboard
  useEffect(() => {
    const el = dashSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreDash(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreDash]);

  // View, search, and filter state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [scrollDirection, setScrollDirection] =
    useState<ScrollDirection>("vertical");
  const [searchQuery, setSearchQuery] = useState("");
  const [publishFilter, setPublishFilter] = useState<FilterOption>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");

  // Pre-compute search index once when projects change (avoids repeated toLowerCase on every keystroke)
  const searchIndex = useMemo(() => buildSearchIndex(projects), [projects]);

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Apply search
    result = searchProjects(result, searchQuery, searchIndex);

    // Apply publish filter
    if (publishFilter === "published") {
      result = result.filter((p) => p.published);
    } else if (publishFilter === "private") {
      result = result.filter((p) => !p.published);
    }

    // Apply sort
    result.sort((a, b) => {
      switch (sortOption) {
        case "oldest":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case "name-asc":
          return (a.title || a.slug || "").localeCompare(
            b.title || b.slug || "",
          );
        case "name-desc":
          return (b.title || b.slug || "").localeCompare(
            a.title || a.slug || "",
          );
        case "newest":
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });

    return result;
  }, [projects, searchQuery, searchIndex, publishFilter, sortOption]);

  // Responsive columns — only update state when column count truly changes
  // to avoid re-rendering the grid when mobile browser chrome hides/shows
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

  const storagePercent = Math.round((storageUsed / storageLimit) * 100);

  const handleView = (project: ProjectRecord) => {
    const linkSlug =
      project.slug && project.slug.trim() ? project.slug : project.id;
    const encodedSlug = encodeProjectId(linkSlug);
    router.push(`/view/${encodedSlug}`);
  };

  const handleEdit = (project: ProjectRecord) => {
    const projectIdString = String(project.id);
    router.push(`/?project=${projectIdString}`);
  };

  const handleShare = (project: ProjectRecord) => {
    setShareProject(project);
  };

  const handleDownload = (project: ProjectRecord) => {
    setDownloadProject(project);
  };

  const handleExport4C = async (project: ProjectRecord) => {
    await downloadFourCornersJSON(project);
    notify.success("4C metadata exported");
  };

  const handleDelete = (project: ProjectRecord) => {
    setDeleteConfirmProject(project);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmProject) return;
    const project = deleteConfirmProject;
    const title = project.title || project.slug || "this project";
    setDeleteConfirmProject(null);

    setDeleting(project.id);
    const loadingId = notify.loading("Deleting...");

    try {
      // getUser() verifies with Auth server — don't trust unverified cookies for destructive ops
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      await deleteProject(project.id, user.id);
      setProjects(projects.filter((p) => p.id !== project.id));
      notify.dismiss(loadingId);
      notifyFile.deleted(title);
    } catch (error) {
      console.error("Failed to delete project:", error);
      notify.dismiss(loadingId);
      notify.error(error instanceof Error ? error.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface overflow-x-hidden flex flex-col">
      <AppHeader />
      {/* Spacer for fixed header */}
      <div className="h-14 sm:h-16" />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 w-full">
        {/* Toolbar — search + file count + view controls share a single row
            when space allows (sm+). On mobile they stack vertically. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <div className="dashboard-toolbar__search flex-1 min-w-0">
            <div className="input-icon-wrapper has-icon-left has-icon-right">
              <span className="input-icon-left">
                <Search size={18} />
              </span>
              <input
                type="text"
                placeholder="Search files, metadata, locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <span className="input-icon-right">
                  <button onClick={() => setSearchQuery("")} aria-label="Clear search">
                    <X size={16} />
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 justify-end">
            {/* File count intentionally omitted here — the "Showing X of Y files"
                summary below the toolbar already reports the same number and
                adapts to active filters. Duplicating it between the input
                and the view controls was noise. */}
            <FCViewControls
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortOption={sortOption}
              onSortChange={setSortOption}
              filterOption={publishFilter}
              onFilterChange={setPublishFilter}
              showFilter={true}
            />
          </div>
        </div>

        {/* Active filters summary — compact strip, matches the toolbar density. */}
        {(searchQuery || publishFilter !== "all") && (
          <div className="flex items-center justify-between mb-3 px-2 py-1 text-xs">
            <span style={{ color: "var(--fc-text-muted)" }}>
              Showing{" "}
              <span
                className="tabular-nums"
                style={{ color: "var(--fc-text-secondary)" }}
              >
                {filteredProjects.length}
              </span>{" "}
              of{" "}
              <span
                className="tabular-nums"
                style={{ color: "var(--fc-text-secondary)" }}
              >
                {projects.length}
              </span>{" "}
              files
            </span>
            <button
              onClick={() => {
                setSearchQuery("");
                setPublishFilter("all");
              }}
              className="font-medium"
              style={{ color: "var(--fc-accent)" }}
            >
              Clear filters
            </button>
          </div>
        )}

        {loading ? (
          <LoadingOverlay isLoading={true} text="Loading projects..." />
        ) : viewMode === "list" ? (
          <FCProjectList
            projects={filteredProjects}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onShare={handleShare}
            onDownload={handleDownload}
            onExport4C={handleExport4C}
            deletingId={deleting}
            emptyState={
              filteredProjects.length === 0 && projects.length > 0 ? (
                <div className="text-center py-16 bg-surface rounded-xl border border-border">
                  <div className="max-w-md mx-auto">
                    <Search size={48} className="mx-auto mb-4 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-200 mb-2">
                      No matching files
                    </h3>
                    <p className="text-gray-400 mb-4">
                      Try adjusting your search or filters
                    </p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setPublishFilter("all");
                      }}
                      className="text-accent hover:text-accent/80 text-sm font-medium"
                    >
                      Clear all filters
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 bg-surface rounded-xl border border-border">
                  <div className="max-w-md mx-auto">
                    <div className="w-16 h-16 mx-auto mb-6 bg-accent/10 rounded-2xl flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-accent"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-100 mb-2">
                      No files yet
                    </h3>
                    <p className="text-gray-400 mb-6">
                      Create your first Four Corners file to get started
                    </p>
                    <Link
                      href="/?new=true"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-gray-900 font-medium rounded-lg transition-all hover:scale-105"
                    >
                      <svg
                        className="w-5 h-5"
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
                      Create File
                    </Link>
                  </div>
                </div>
              )
            }
          />
        ) : (
          <FCProjectGrid
            projects={filteredProjects}
            direction={viewMode === "grid" ? "masonry" : scrollDirection}
            columns={columns}
            mode="dashboard"
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onShare={handleShare}
            onDownload={handleDownload}
            onExport4C={handleExport4C}
            deletingId={deleting}
            cardProps={{
              showCaption: true,
              showAuthor: false,
              showDate: false,
              showCornerIndicators: true,
            }}
            emptyState={
              filteredProjects.length === 0 && projects.length > 0 ? (
                <div className="text-center py-16 bg-surface rounded-xl border border-border">
                  <div className="max-w-md mx-auto">
                    <Search size={48} className="mx-auto mb-4 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-200 mb-2">
                      No matching files
                    </h3>
                    <p className="text-gray-400 mb-4">
                      Try adjusting your search or filters
                    </p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setPublishFilter("all");
                      }}
                      className="text-accent hover:text-accent/80 text-sm font-medium"
                    >
                      Clear all filters
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 bg-surface rounded-xl border border-border">
                  <div className="max-w-md mx-auto">
                    <div className="w-16 h-16 mx-auto mb-6 bg-accent/10 rounded-2xl flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-accent"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-100 mb-2">
                      No files yet
                    </h3>
                    <p className="text-gray-400 mb-6">
                      Create your first Four Corners file to get started
                    </p>
                    <Link
                      href="/?new=true"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-gray-900 font-medium rounded-lg transition-all hover:scale-105"
                    >
                      <svg
                        className="w-5 h-5"
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
                      Create File
                    </Link>
                  </div>
                </div>
              )
            }
          />
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && !searchQuery && (
          <div ref={dashSentinelRef} style={{ height: 1 }} aria-hidden="true" />
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

        {/* Storage Footer */}
        <div className="mt-12 p-6 bg-surface border border-border rounded-xl">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
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
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                  />
                </svg>
                Storage Usage
              </h3>
              <p className="text-xs text-gray-400">
                Free plan · {formatBytes(storageUsed)} of{" "}
                {formatBytes(storageLimit)} used
              </p>
            </div>
            <span className="text-xl font-semibold text-gray-100">
              {storagePercent}%
            </span>
          </div>
          <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                storagePercent > 80
                  ? "bg-gradient-to-r from-orange-500 to-red-500"
                  : "bg-gradient-to-r from-teal-500 to-teal-400"
              }`}
              style={{
                width: `${Math.min(storagePercent, 100)}%`,
                minWidth: storagePercent > 0 ? "8px" : "0",
              }}
            />
          </div>
          {storagePercent > 80 && (
            <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <p className="text-sm text-orange-400 flex items-start gap-2">
                <svg
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span>
                  You&apos;re approaching your storage limit. Consider deleting
                  unused files or upgrading your plan.
                </span>
              </p>
            </div>
          )}
        </div>

      </main>

      {/* Share Modal */}
      {shareProject && (
        <ShareModal
          project={shareProject}
          onClose={() => setShareProject(null)}
        />
      )}

      {/* Download Modal */}
      {downloadProject && (
        <DownloadModal
          project={downloadProject}
          onClose={() => setDownloadProject(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmProject && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setDeleteConfirmProject(null)}
          />
          <div className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 flex items-center justify-center">
            <div className="bg-surface border border-border rounded-xl shadow-2xl p-5 sm:p-6 w-full sm:w-[24rem]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={20} className="text-red-400" />
                </div>
                <h3 className="text-base font-semibold text-gray-200">
                  Delete File
                </h3>
              </div>
              <p className="text-sm text-gray-400 mb-6">
                Delete &ldquo;{deleteConfirmProject.title || deleteConfirmProject.slug || "Untitled"}&rdquo;?
                This cannot be undone and will remove all associated data.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirmProject(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 bg-surface-alt border border-border rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
