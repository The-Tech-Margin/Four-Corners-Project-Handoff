"use client";

import { useState } from "react";

interface AddContextDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: {
    src: string;
    caption: string;
    type: "image" | "video";
  }) => void;
}

export function AddContextDialog({
  isOpen,
  onClose,
  onAdd,
}: AddContextDialogProps) {
  const [src, setSrc] = useState("");
  const [caption, setCaption] = useState("");
  const [type, setType] = useState<"image" | "video">("image");
  const [batchMode, setBatchMode] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (src.trim() && caption.trim()) {
      onAdd({ src: src.trim(), caption: caption.trim(), type });
      setSrc("");
      setCaption("");
      if (!batchMode) {
        setType("image");
        onClose();
      }
    }
  };

  const handleClose = () => {
    setSrc("");
    setCaption("");
    setType("image");
    setBatchMode(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-surface rounded-2xl border border-border max-w-md w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-sm bg-corner-context"></div>
          <h2 className="text-lg font-medium text-gray-200">
            Add Context Media
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType("image")}
                className={`flex-1 py-2.5 px-3 text-sm rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                  type === "image"
                    ? "bg-corner-context/20 border-corner-context text-corner-context"
                    : "bg-surface-alt border-border/50 text-gray-400 hover:border-border"
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <rect
                    x="5"
                    y="6"
                    width="6"
                    height="4"
                    rx="0.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                  />
                  <circle cx="8" cy="8" r="1" fill="currentColor" />
                </svg>
                Image
              </button>
              <button
                type="button"
                onClick={() => setType("video")}
                className={`flex-1 py-2.5 px-3 text-sm rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                  type === "video"
                    ? "bg-corner-context/20 border-corner-context text-corner-context"
                    : "bg-surface-alt border-border/50 text-gray-400 hover:border-border"
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path d="M6 5.5l4.5 2.5-4.5 2.5V5.5z" fill="currentColor" />
                </svg>
                Video
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">URL</label>
            <input
              type="url"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              className="w-full bg-surface-alt rounded-lg px-3 py-2.5 text-sm text-gray-200 border border-border/50 focus:border-corner-context/50 focus:outline-none"
              placeholder="https://example.com/image.jpg"
              required
            />
            <p className="text-xs text-gray-600 mt-1">
              Before/after photos, video of scene, comparative images
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Caption
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full bg-surface-alt rounded-lg px-3 py-2.5 text-sm text-gray-200 border border-border/50 focus:border-corner-context/50 focus:outline-none resize-none"
              placeholder="Describe what this shows..."
              rows={3}
              required
            />
          </div>

          <div className="flex items-center gap-2 pt-2 pb-1">
            <input
              type="checkbox"
              id="batch-mode"
              checked={batchMode}
              onChange={(e) => setBatchMode(e.target.checked)}
              className="w-4 h-4 rounded bg-surface-alt border-border text-corner-context focus:ring-corner-context/30"
            />
            <label
              htmlFor="batch-mode"
              className="text-xs text-gray-500 cursor-pointer"
            >
              Add multiple (keep dialog open)
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 text-sm text-gray-400 bg-surface-alt border border-border/50 rounded-lg hover:bg-surface transition-colors focus:outline-none focus:border-accent/50"
            >
              {batchMode ? "Done" : "Cancel"}
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 text-sm font-medium text-white bg-corner-context rounded-lg hover:bg-corner-context/90 transition-colors focus:outline-none focus:ring-2 focus:ring-corner-context/30"
            >
              {batchMode ? "+ Add Another" : "Add Context"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
