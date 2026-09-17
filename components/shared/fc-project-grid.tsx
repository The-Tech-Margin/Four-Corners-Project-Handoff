"use client";

import { type ReactNode, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Masonry from "react-masonry-css";
import type { ProjectRecord } from "@/lib/projects/types";
import { FCProjectCard, type FCProjectCardProps } from "./fc-project-card";

export interface FCProjectGridProps {
  projects: ProjectRecord[];
  direction: "vertical" | "horizontal" | "masonry";
  columns?: number;
  mode: "gallery" | "dashboard";
  cardProps?: Partial<Omit<FCProjectCardProps, "project" | "mode">>;
  emptyState?: ReactNode;
  // Dashboard-specific
  onView?: (project: ProjectRecord) => void;
  onEdit?: (project: ProjectRecord) => void;
  onDelete?: (project: ProjectRecord) => void;
  onShare?: (project: ProjectRecord) => void;
  onDownload?: (project: ProjectRecord) => void;
  onExport4C?: (project: ProjectRecord) => void;
  deletingId?: string | null;
}

/**
 * Scrollable grid container for project cards.
 * Supports vertical (virtualized), horizontal (snap scroll), and masonry layouts.
 */
export function FCProjectGrid({
  projects,
  direction,
  columns = 1,
  mode,
  cardProps = {},
  emptyState,
  onView,
  onEdit,
  onDelete,
  onShare,
  onDownload,
  onExport4C,
  deletingId,
}: FCProjectGridProps) {
  const horizontalRef = useRef<HTMLDivElement>(null);

  // Horizontal scroll navigation
  const scrollHorizontal = (dir: "left" | "right") => {
    if (!horizontalRef.current) return;
    const container = horizontalRef.current;
    const cardWidth =
      container.querySelector(".fc-card-wrapper")?.clientWidth || 300;
    const scrollAmount = dir === "left" ? -cardWidth : cardWidth;
    container.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  if (projects.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  // Horizontal scroll layout
  if (direction === "horizontal") {
    return (
      <div className="fc-grid-horizontal-wrapper">
        {/* Left arrow */}
        <button
          className="fc-grid-nav fc-grid-nav--left"
          onClick={() => scrollHorizontal("left")}
          aria-label="Scroll left"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Horizontal scroll container */}
        <div ref={horizontalRef} className="fc-grid fc-grid--horizontal">
          {projects.map((project, index) => (
            <div key={project.id} className="fc-card-wrapper fc-card-wrapper--fade-in">
              <FCProjectCard
                project={project}
                {...cardProps}
                mode={mode}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                onShare={onShare}
                onDownload={onDownload}
                onExport4C={onExport4C}
                isDeleting={deletingId === project.id}
                priorityImage={index < 9}
              />
            </div>
          ))}
        </div>

        {/* Right arrow */}
        <button
          className="fc-grid-nav fc-grid-nav--right"
          onClick={() => scrollHorizontal("right")}
          aria-label="Scroll right"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    );
  }

  // Masonry layout - fits cards in viewport without scrolling
  if (direction === "masonry") {
    const breakpointColumns = {
      default: columns,
      1100: Math.min(columns, 3),
      700: Math.min(columns, 2),
      500: 1,
    };

    return (
      <div className="fc-grid fc-grid--masonry">
        <Masonry
          breakpointCols={breakpointColumns}
          className="fc-masonry"
          columnClassName="fc-masonry__column"
        >
          {projects.map((project, index) => (
            <div
              key={project.id}
              className="fc-card-wrapper fc-card-wrapper--masonry fc-card-wrapper--fade-in"
            >
              <FCProjectCard
                project={project}
                {...cardProps}
                mode={mode}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                onShare={onShare}
                onDownload={onDownload}
                onExport4C={onExport4C}
                isDeleting={deletingId === project.id}
                priorityImage={index < 9}
              />
            </div>
          ))}
        </Masonry>
      </div>
    );
  }

  // Vertical virtualized layout
  return (
    <Virtuoso
      className="fc-grid fc-grid--vertical"
      style={{ height: "calc(100dvh - 200px)", minHeight: "300px" }}
      totalCount={Math.ceil(projects.length / columns)}
      overscan={columns === 1 ? 5 : 3}
      scrollSeekConfiguration={{
        enter: (velocity) => Math.abs(velocity) > 500,
        exit: (velocity) => Math.abs(velocity) < 100,
      }}
      itemContent={(rowIndex) => {
        const startIdx = rowIndex * columns;
        const rowProjects = projects.slice(startIdx, startIdx + columns);

        return (
          <div
            className="fc-grid__row"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: "1rem",
              padding: "0.5rem 0",
            }}
          >
            {rowProjects.map((project, colIdx) => (
              <div key={project.id} className="fc-card-wrapper fc-card-wrapper--fade-in">
                <FCProjectCard
                  project={project}
                  {...cardProps}
                  mode={mode}
                  onView={onView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onShare={onShare}
                  isDeleting={deletingId === project.id}
                  priorityImage={startIdx + colIdx < 9}
                />
              </div>
            ))}
          </div>
        );
      }}
    />
  );
}
