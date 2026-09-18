"use client";

import { useState } from "react";
import { LayoutGrid, List, ChevronDown, Check, Tag } from "lucide-react";
import { displayTag } from "@/lib/tags";

export type ViewMode = "grid" | "list";
export type SortOption =
  | "random"
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc";
export type FilterOption = "all" | "published" | "private";

interface FCViewControlsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterOption?: FilterOption;
  onFilterChange?: (filter: FilterOption) => void;
  showFilter?: boolean;
  /** Gallery tag filtering — all unique tags present in data */
  availableTags?: string[];
  /** Currently selected tags */
  activeTags?: Set<string>;
  /** Toggle a single tag on/off */
  onTagToggle?: (tag: string) => void;
  /** Clear all active tags */
  onTagsClear?: () => void;
}

const SORT_LABELS: Record<SortOption, string> = {
  random: "Random",
  newest: "Newest",
  oldest: "Oldest",
  "name-asc": "A\u2013Z",
  "name-desc": "Z\u2013A",
};

const FILTER_LABELS: Record<FilterOption, string> = {
  all: "All files",
  published: "Published",
  private: "Private",
};

/**
 * Shared view controls for Dashboard and Gallery
 * Uses dashboard-toolbar CSS classes for consistent styling
 */
export function FCViewControls({
  viewMode,
  onViewModeChange,
  sortOption,
  onSortChange,
  filterOption = "all",
  onFilterChange,
  showFilter = false,
  availableTags,
  activeTags,
  onTagToggle,
  onTagsClear,
}: FCViewControlsProps) {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isTagOpen, setIsTagOpen] = useState(false);

  const sortLabel = showFilter
    ? `${FILTER_LABELS[filterOption]} · ${SORT_LABELS[sortOption]}`
    : SORT_LABELS[sortOption];

  const tagCount = activeTags?.size ?? 0;
  const showTags = availableTags && availableTags.length > 0 && onTagToggle;

  return (
    <div className="dashboard-toolbar__view-toggle" style={{ position: "relative" }}>
      {/* Tag filter */}
      {showTags && (
        <>
          <button
            onClick={() => { setIsTagOpen(!isTagOpen); setIsSortOpen(false); }}
            className={`dashboard-toolbar__view-btn ${isTagOpen || tagCount > 0 ? "dashboard-toolbar__view-btn--active" : ""}`}
            aria-label={tagCount > 0 ? `Filter by tag (${tagCount} active)` : "Filter by tag"}
            aria-haspopup="menu"
            aria-expanded={isTagOpen}
            title="Filter by tag"
          >
            <Tag size={14} />
            {tagCount > 0 && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1,
                minWidth: 12,
                height: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "var(--fc-accent)",
                color: "var(--fc-bg)",
                marginLeft: 1,
              }}>
                {tagCount}
              </span>
            )}
          </button>
          {isTagOpen && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setIsTagOpen(false)} />
              <div className="fc-dropdown-menu" style={{ left: 0, right: "auto" }}>
                <div className="fc-dropdown-menu__header">Filter by tag</div>
                {availableTags.map((tag) => {
                  const isActive = activeTags?.has(tag) ?? false;
                  return (
                    <button
                      key={tag}
                      onClick={() => onTagToggle(tag)}
                      className={`fc-dropdown-menu__item ${isActive ? "fc-dropdown-menu__item--active" : ""}`}
                    >
                      <span>{displayTag(tag)}</span>
                      {isActive && <Check size={12} />}
                    </button>
                  );
                })}
                {tagCount > 0 && onTagsClear && (
                  <>
                    <div className="fc-dropdown-menu__divider" />
                    <button
                      onClick={() => { onTagsClear(); setIsTagOpen(false); }}
                      className="fc-dropdown-menu__item"
                    >
                      <span>Clear all</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Sort */}
      <button
        onClick={() => { setIsSortOpen(!isSortOpen); setIsTagOpen(false); }}
        className={`dashboard-toolbar__view-btn ${isSortOpen ? "dashboard-toolbar__view-btn--active" : ""}`}
        aria-label={`Sort: ${sortLabel}`}
        aria-haspopup="menu"
        aria-expanded={isSortOpen}
        style={{ gap: 3 }}
      >
        <span style={{ fontSize: 12 }}>{sortLabel}</span>
        <ChevronDown size={11} className={`transition-transform ${isSortOpen ? "rotate-180" : ""}`} />
      </button>
      {isSortOpen && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setIsSortOpen(false)} />
          <div className="fc-dropdown-menu" style={{ right: 0 }}>
            {showFilter && onFilterChange && (
              <>
                <div className="fc-dropdown-menu__header">Filter</div>
                {(Object.keys(FILTER_LABELS) as FilterOption[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => { onFilterChange(f); setIsSortOpen(false); }}
                    className={`fc-dropdown-menu__item ${filterOption === f ? "fc-dropdown-menu__item--active" : ""}`}
                  >
                    <span>{FILTER_LABELS[f]}</span>
                    {filterOption === f && <Check size={12} />}
                  </button>
                ))}
                <div className="fc-dropdown-menu__divider" />
              </>
            )}
            <div className="fc-dropdown-menu__header">Sort</div>
            {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => (
              <button
                key={s}
                onClick={() => { onSortChange(s); setIsSortOpen(false); }}
                className={`fc-dropdown-menu__item ${sortOption === s ? "fc-dropdown-menu__item--active" : ""}`}
              >
                <span>{SORT_LABELS[s]}</span>
                {sortOption === s && <Check size={12} />}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Grid / List */}
      <button
        onClick={() => onViewModeChange("grid")}
        className={`dashboard-toolbar__view-btn ${viewMode === "grid" ? "dashboard-toolbar__view-btn--active" : ""}`}
        aria-label="Grid view"
        aria-pressed={viewMode === "grid"}
        title="Grid view"
      >
        <LayoutGrid size={15} />
      </button>
      <button
        onClick={() => onViewModeChange("list")}
        className={`dashboard-toolbar__view-btn ${viewMode === "list" ? "dashboard-toolbar__view-btn--active" : ""}`}
        aria-label="List view"
        aria-pressed={viewMode === "list"}
        title="List view"
      >
        <List size={15} />
      </button>
    </div>
  );
}
