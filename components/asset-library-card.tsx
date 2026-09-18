"use client";

import type { UserAsset } from "@/lib/field-registry";
import { FileAudio, FileText, Play } from "lucide-react";

interface AssetLibraryCardProps {
  asset: UserAsset;
  selected: boolean;
  onToggle: () => void;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  const year = Math.floor(day / 365);
  return `${year}y ago`;
}

function formatDuration(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AssetLibraryCard({
  asset,
  selected,
  onToggle,
}: AssetLibraryCardProps) {
  const thumbSrc = asset.thumbnailStorageUrl || asset.storageUrl;
  const duration = formatDuration(asset.duration);
  const age = formatRelativeTime(asset.createdAt);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`group relative flex flex-col text-left rounded-xl overflow-hidden border transition-all focus:outline-none focus:ring-2 focus:ring-corner-context/60 ${
        selected
          ? "border-corner-context ring-2 ring-corner-context/60 bg-corner-context/10"
          : "border-border hover:border-corner-context/60 bg-surface"
      }`}
    >
      <div className="relative aspect-square bg-surface-alt overflow-hidden">
        {asset.mediaType === "audio" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-alt">
            <FileAudio
              className="w-10 h-10 text-gray-500 group-hover:text-corner-context transition-colors"
              aria-hidden="true"
            />
          </div>
        ) : asset.mediaType === "document" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-alt">
            <FileText
              className="w-10 h-10 text-gray-500 group-hover:text-corner-context transition-colors"
              aria-hidden="true"
            />
          </div>
        ) : thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt={asset.fileName}
            loading="lazy"
            draggable={false}
            className="w-full h-full object-cover fc-protected-img"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
            Preview unavailable
          </div>
        )}

        {asset.mediaType === "video" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-white" />
            </div>
          </div>
        )}

        {duration && (
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white font-medium tabular-nums">
            {duration}
          </div>
        )}

        {selected && (
          <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-corner-context flex items-center justify-center">
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
      </div>

      <div className="px-2 py-1.5 min-w-0">
        <p className="text-[11px] sm:text-xs text-gray-200 truncate" title={asset.fileName}>
          {asset.fileName}
        </p>
        {age && (
          <p className="text-[10px] text-gray-500 truncate">{age}</p>
        )}
      </div>
    </button>
  );
}
