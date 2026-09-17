"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { listUserProjects, type ProjectRecord } from "@/lib/db/projects";
import Modal from "@/components/modal";

interface ProjectPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (project: ProjectRecord) => void;
  onCreateNew?: () => void;
}

export function ProjectPickerModal({
  isOpen,
  onClose,
  onSelect,
  onCreateNew,
}: ProjectPickerModalProps) {
  const supabase = createClient();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageLimit] = useState(100 * 1024 * 1024); // 100 MB default

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen]);

  const loadProjects = async () => {
    setLoading(true);
    setError("");

    try {
      if (!supabase) {
        setError("Supabase is not configured");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Close modal if no user - auth should be handled before opening this modal
        onClose();
        return;
      }

      const userProjects = await listUserProjects(user.id);
      setProjects(userProjects);

      // Calculate storage used (rough estimate based on project count)
      // In production, you'd track this in a profile table
      const estimatedStorage = userProjects.length * 2 * 1024 * 1024; // ~2MB per project
      setStorageUsed(estimatedStorage);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (typeof bytes !== "number" || isNaN(bytes) || bytes < 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Your Projects"
      maxWidth="4xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-corner-backstory"></div>
        </div>
      )}

      {error && (
        <div className="m-4 bg-red-500/20 text-red-400 p-4 rounded">
          {error}
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="text-center py-16 px-4">
          <div className="flex flex-col items-center justify-center">
            <svg
              className="w-16 h-16 text-gray-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-gray-300 text-lg mb-2">No saved projects yet</p>
            <p className="text-gray-500 text-sm mb-6">
              Create your first project to get started
            </p>
            {onCreateNew && (
              <button
                onClick={() => {
                  onCreateNew();
                  onClose();
                }}
                className="px-6 py-2.5 bg-corner-backstory text-gray-900 font-medium rounded-lg hover:bg-corner-backstory/80 transition-all flex items-center gap-2"
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
                Create New Project
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && !error && projects.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(project);
              }}
              className="bg-surface border border-border rounded-lg overflow-hidden hover:border-corner-backstory hover:-translate-y-0.5 transition-all text-left"
            >
              {/* Thumbnail */}
              <div className="aspect-[4/3] relative overflow-hidden bg-surface-alt">
                {project.main_image_url ? (
                  <img
                    src={project.main_image_url}
                    alt={project.title || "Project thumbnail"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    <svg
                      className="w-12 h-12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
                {project.published && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 bg-green-500/90 text-white text-[10px] font-medium rounded uppercase">
                    Public
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="font-medium text-gray-100 text-sm truncate">
                  {project.title || project.slug || "Untitled"}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatDate(project.created_at)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      {!loading && !error && projects.length > 0 && (
        <div className="modal-footer flex items-center justify-between px-6 py-3 border-t text-sm modal-text-muted">
          <span>
            Showing {projects.length} of {projects.length} project
            {projects.length !== 1 ? "s" : ""}
          </span>
          <span>
            {formatBytes(storageUsed)} of {formatBytes(storageLimit)} used
          </span>
        </div>
      )}
    </Modal>
  );
}
