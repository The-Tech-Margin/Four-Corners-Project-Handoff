"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./modal";
import { AssetLibraryCard } from "./asset-library-card";
import { StorageUsageBadge } from "./storage-usage-badge";
import { useUserAssets } from "@/hooks/useUserAssets";
import type { UserAsset, UserAssetMediaType } from "@/lib/field-registry";
import { Search, X, Check, ChevronDown } from "lucide-react";

export interface AssetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (assets: UserAsset[]) => void;
  /** When true, users can pick multiple assets before confirming. Default false. */
  multiSelect?: boolean;
  /** Restrict which media types are shown + selectable. */
  allowedTypes?: UserAssetMediaType[];
  /** Button label on the confirmation CTA. */
  confirmLabel?: string;
  /** Optional modal title override. */
  title?: string;
}

const ALL_TYPES: UserAssetMediaType[] = [
  "image",
  "video",
  "audio",
  "document",
];

const TYPE_LABELS: Record<UserAssetMediaType, string> = {
  image: "Images",
  video: "Videos",
  audio: "Audio",
  document: "Documents",
};

const SORT_LABELS: Record<"newest" | "oldest", string> = {
  newest: "Newest",
  oldest: "Oldest",
};

/** First-page size kept small so initial paint shows "recent items" quickly. */
const PAGE_SIZE = 24;

export function AssetLibraryModal({
  isOpen,
  onClose,
  onSelect,
  multiSelect = false,
  allowedTypes,
  confirmLabel,
  title = "Your library",
}: AssetLibraryModalProps) {
  const visibleTypes = useMemo<UserAssetMediaType[]>(
    () => (allowedTypes && allowedTypes.length > 0 ? allowedTypes : ALL_TYPES),
    [allowedTypes],
  );

  const [typeFilter, setTypeFilter] = useState<UserAssetMediaType | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [selected, setSelected] = useState<Map<string, UserAsset>>(new Map());
  const [isSortOpen, setIsSortOpen] = useState(false);

  // Render-phase state reset when modal closes (same pattern as image-drop-zone).
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setQuery("");
      setTypeFilter("all");
      setSort("newest");
      setSelected(new Map());
      setIsSortOpen(false);
    }
  }

  const effectiveTypes = useMemo<UserAssetMediaType[]>(() => {
    if (typeFilter === "all") return visibleTypes;
    return [typeFilter];
  }, [typeFilter, visibleTypes]);

  const { assets, loading, error, hasMore, loadMore } = useUserAssets({
    query,
    mediaTypes: effectiveTypes,
    sort,
    pageSize: PAGE_SIZE,
    enabled: isOpen,
  });

  const toggleAsset = (asset: UserAsset) => {
    // Single-select: clicking a card is the final action — pick it and close.
    // Saves an unnecessary second click on the confirm button.
    if (!multiSelect) {
      onSelect([asset]);
      onClose();
      return;
    }
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.set(asset.id, asset);
      return next;
    });
  };

  const handleConfirm = () => {
    const picks = Array.from(selected.values());
    if (picks.length === 0) return;
    onSelect(picks);
    onClose();
  };

  // Infinite scroll: observe a sentinel at the bottom of the grid.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore && !loading) {
          loadMore();
        }
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isOpen, hasMore, loading, loadMore]);

  const pickCount = selected.size;
  const showTypeChips = visibleTypes.length > 1;
  const resolvedConfirm =
    confirmLabel ??
    (pickCount > 0 ? `Add${multiSelect ? ` (${pickCount})` : ""}` : "Add");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="6xl">
      <div ref={scrollRef} className="relative">
        {/* Toolbar — search field + sort dropdown. Type filters are
            surfaced as inline chips on the row below for one-click access. */}
        <div
          className="modal-header sticky top-0 z-20 flex items-center gap-2 px-3 sm:px-5 py-2.5 border-b"
          style={{ background: "var(--fc-modal-bg)" }}
        >
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none modal-text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search library"
              className="modal-input w-full h-9 text-sm rounded-lg border pl-8 pr-8 focus:outline-none focus:border-[color:var(--fc-corner-context)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded modal-text-muted hover:modal-text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setIsSortOpen((v) => !v)}
              className={`dashboard-toolbar__view-btn ${
                isSortOpen ? "dashboard-toolbar__view-btn--active" : ""
              }`}
              style={{ height: 36, gap: 3 }}
              aria-label="Sort order"
              title="Sort order"
            >
              <span style={{ fontSize: 12 }}>{SORT_LABELS[sort]}</span>
              <ChevronDown
                size={11}
                className={`transition-transform ${isSortOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isSortOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsSortOpen(false)}
                />
                <div className="fc-dropdown-menu" style={{ right: 0 }}>
                  <div className="fc-dropdown-menu__header">Sort</div>
                  <DropdownItem
                    active={sort === "newest"}
                    onClick={() => {
                      setSort("newest");
                      setIsSortOpen(false);
                    }}
                  >
                    Newest
                  </DropdownItem>
                  <DropdownItem
                    active={sort === "oldest"}
                    onClick={() => {
                      setSort("oldest");
                      setIsSortOpen(false);
                    }}
                  >
                    Oldest
                  </DropdownItem>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Type chips — always-visible filters. Hidden when the caller has
            restricted the modal to a single type (no point showing chips
            with only "All" and one option). */}
        {showTypeChips && (
          <div
            className="sticky z-10 flex items-center gap-1.5 px-3 sm:px-5 py-2 border-b overflow-x-auto"
            style={{
              top: 49,
              background: "var(--fc-modal-bg)",
              borderColor: "var(--fc-border)",
            }}
            role="tablist"
            aria-label="Filter by media type"
          >
            <TypeChip
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
            >
              All
            </TypeChip>
            {visibleTypes.map((t) => (
              <TypeChip
                key={t}
                active={typeFilter === t}
                onClick={() => setTypeFilter(t)}
              >
                {TYPE_LABELS[t]}
              </TypeChip>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="px-3 sm:px-5 py-3">
          {error && (
            <div
              className="mb-3 p-3 rounded-lg border text-xs"
              style={{
                background:
                  "color-mix(in srgb, var(--fc-danger) 10%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--fc-danger) 30%, transparent)",
                color: "var(--fc-danger-soft)",
              }}
            >
              Couldn&apos;t load your library: {error}
            </div>
          )}

          {!loading && assets.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                style={{ background: "var(--fc-surface-alt)" }}
              >
                <Search
                  className="w-6 h-6"
                  style={{ color: "var(--fc-text-muted)" }}
                />
              </div>
              <p className="text-sm modal-text font-medium">
                {query ? "No matching assets" : "Your library is empty"}
              </p>
              <p className="text-xs modal-text-muted mt-1 max-w-sm">
                {query
                  ? "Try a different search or clear the filter."
                  : "Uploads you make to any project will show up here automatically."}
              </p>
            </div>
          )}

          {assets.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
              {assets.map((asset) => (
                <AssetLibraryCard
                  key={asset.id}
                  asset={asset}
                  selected={selected.has(asset.id)}
                  onToggle={() => toggleAsset(asset)}
                />
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="h-4" aria-hidden="true" />

          {loading && (
            <div className="flex items-center justify-center py-4 text-xs modal-text-muted">
              <div
                className="w-4 h-4 border-2 rounded-full animate-spin mr-2"
                style={{
                  borderColor: "var(--fc-corner-context)",
                  borderTopColor: "transparent",
                }}
              />
              Loading recent…
            </div>
          )}
        </div>

        {/* Footer — sticky bottom. Storage usage is anchored left so users
            see their quota while browsing. Selected count takes priority
            when multi-selecting. */}
        <div
          className="modal-footer sticky bottom-0 z-10 flex items-center justify-end gap-2 px-3 sm:px-5 py-3 border-t"
          style={{ background: "var(--fc-modal-bg)" }}
        >
          {multiSelect && pickCount > 0 ? (
            <span className="mr-auto text-xs modal-text-muted">
              {pickCount} selected
            </span>
          ) : (
            <StorageUsageBadge variant="compact" className="mr-auto" />
          )}
          <button
            type="button"
            onClick={onClose}
            className="modal-button-secondary px-4 py-2 text-sm rounded-lg border border-[color:var(--fc-border)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pickCount === 0}
            className="modal-button-primary px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {resolvedConfirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface DropdownItemProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function DropdownItem({ active, onClick, children }: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`fc-dropdown-menu__item ${active ? "fc-dropdown-menu__item--active" : ""}`}
    >
      <span>{children}</span>
      {active && <Check size={12} />}
    </button>
  );
}

interface TypeChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TypeChip({ active, onClick, children }: TypeChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="text-xs px-3 py-1.5 rounded border whitespace-nowrap transition-colors"
      style={
        active
          ? {
              background:
                "color-mix(in srgb, var(--fc-accent) 10%, transparent)",
              color: "var(--fc-accent)",
              borderColor: "var(--fc-accent)",
            }
          : {
              background: "transparent",
              color: "var(--fc-text)",
              borderColor: "var(--fc-border)",
            }
      }
    >
      {children}
    </button>
  );
}
