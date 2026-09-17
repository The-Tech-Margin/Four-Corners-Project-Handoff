"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

type Visibility = "public" | "unlisted" | "private";

interface VisibilityToggleProps {
  projectId: string;
  projectSlug: string;
  currentVisibility: Visibility;
  onChange?: (visibility: Visibility) => void;
}

export function VisibilityToggle({
  projectId,
  projectSlug,
  currentVisibility,
  onChange,
}: VisibilityToggleProps) {
  const supabase = createClient();
  const [visibility, setVisibility] = useState<Visibility>(currentVisibility);
  const [updating, setUpdating] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  const handleChange = async (newVisibility: Visibility) => {
    if (!supabase) return;

    setUpdating(true);

    try {
      // Update published boolean based on visibility
      const published = newVisibility !== "private";

      const { error } = await supabase
        .from("projects")
        .update({
          published,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);

      if (error) throw error;

      setVisibility(newVisibility);
      onChange?.(newVisibility);
    } catch (error) {
      console.error("Failed to update visibility:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update visibility");
    } finally {
      setUpdating(false);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/p/${projectSlug}`;
    copy(url);
  };

  const shareableUrl = `${window.location.host}/p/${projectSlug}`;

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-300 mb-2">Visibility:</div>

      <fieldset disabled={updating} className="space-y-2">
        {/* Public */}
        <label
          className={`
            flex items-start gap-3 p-3 rounded-lg border cursor-pointer
            transition-colors
            ${
              visibility === "public"
                ? "border-corner-backstory bg-corner-backstory/10"
                : "border-border bg-surface-alt hover:border-border-light"
            }
            ${updating ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <input
            type="radio"
            name="visibility"
            value="public"
            checked={visibility === "public"}
            onChange={() => handleChange("public")}
            className="mt-0.5"
          />
          <svg
            className="w-5 h-5 mt-0.5 text-gray-400 flex-shrink-0"
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
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-100">Public</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Anyone with the link can view
            </p>
          </div>
        </label>

        {/* Unlisted */}
        <label
          className={`
            flex items-start gap-3 p-3 rounded-lg border cursor-pointer
            transition-colors
            ${
              visibility === "unlisted"
                ? "border-corner-backstory bg-corner-backstory/10"
                : "border-border bg-surface-alt hover:border-border-light"
            }
            ${updating ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <input
            type="radio"
            name="visibility"
            value="unlisted"
            checked={visibility === "unlisted"}
            onChange={() => handleChange("unlisted")}
            className="mt-0.5"
          />
          <svg
            className="w-5 h-5 mt-0.5 text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-100">Unlisted</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Only people with the link (not in search results)
            </p>
          </div>
        </label>

        {/* Private */}
        <label
          className={`
            flex items-start gap-3 p-3 rounded-lg border cursor-pointer
            transition-colors
            ${
              visibility === "private"
                ? "border-corner-backstory bg-corner-backstory/10"
                : "border-border bg-surface-alt hover:border-border-light"
            }
            ${updating ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <input
            type="radio"
            name="visibility"
            value="private"
            checked={visibility === "private"}
            onChange={() => handleChange("private")}
            className="mt-0.5"
          />
          <svg
            className="w-5 h-5 mt-0.5 text-gray-400 flex-shrink-0"
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
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-100">Private</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Only you can view this project
            </p>
          </div>
        </label>
      </fieldset>

      {/* Shareable Link */}
      {visibility !== "private" && (
        <div className="flex items-center gap-2 p-3 bg-surface-alt rounded-lg border border-border">
          <code className="flex-1 text-xs text-gray-300 truncate">
            {shareableUrl}
          </code>
          <button
            onClick={copyLink}
            className="px-3 py-1 text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 rounded transition-colors"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
