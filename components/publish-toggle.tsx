"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { togglePublish } from "@/lib/db/projects";

interface PublishToggleProps {
  projectId: string | null;
  isPublished: boolean;
  onChange?: (published: boolean) => void;
}

export function PublishToggle({
  projectId,
  isPublished,
  onChange,
}: PublishToggleProps) {
  const supabase = createClient();
  const [published, setPublished] = useState(isPublished);
  const [updating, setUpdating] = useState(false);

  const handleToggle = async () => {
    if (!projectId || !supabase) return;

    setUpdating(true);

    try {
      await togglePublish(projectId, !published);
      setPublished(!published);
      onChange?.(!published);
    } catch (error) {
      console.error("Failed to toggle publish:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update visibility");
    } finally {
      setUpdating(false);
    }
  };

  if (!projectId) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={updating}
      className={`
        px-3 py-1.5 text-xs font-medium rounded
        transition-all duration-200
        ${
          published
            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            : "bg-gray-700 text-gray-400 hover:bg-gray-600"
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        flex items-center gap-1.5
      `}
      title={
        published
          ? "Project is public - anyone can view"
          : "Project is private - only you can view"
      }
    >
      {published ? (
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ) : (
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      )}
      <span>{updating ? "..." : published ? "Published" : "Private"}</span>
    </button>
  );
}
