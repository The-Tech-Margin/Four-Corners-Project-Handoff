"use client";

import Modal from "@/components/modal";
import { VoiceInput } from "@/components/voice-input";

interface SlugInputModalProps {
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading: boolean;
}

/**
 * Derive a URL-safe slug from a human-readable title.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+/, "");
}

export function SlugInputModal({
  isOpen,
  value,
  onChange,
  onSubmit,
  onCancel,
  loading,
}: SlugInputModalProps) {
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const slug = slugify(value);

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title="Create New Project"
      maxWidth="md"
    >
      <div className="px-4 sm:px-5 py-4">
        <p className="modal-text text-sm mb-4">
          Give your project a title. A URL-safe slug will be generated
          automatically.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Project Title
            </label>
            <VoiceInput
              value={value}
              onChange={onChange}
              placeholder="My Photo Title"
              ariaLabel="Project title"
            />

            {slug && (
              <div className="text-xs text-gray-400 bg-surface-alt p-2 rounded mt-2">
                <span className="text-gray-500">slug:</span>{" "}
                <span className="font-mono">{slug}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="modal-button-secondary flex-1 px-4 py-2 font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="modal-button-primary flex-1 px-4 py-2 font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
