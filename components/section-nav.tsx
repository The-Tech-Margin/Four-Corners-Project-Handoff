"use client";

import { RefObject } from "react";

interface SectionNavProps {
  sections: {
    id: string;
    label: string;
    ref: RefObject<HTMLDivElement | null>;
  }[];
  currentSection?: string;
}

export function SectionNav({ sections, currentSection }: SectionNavProps) {
  const currentIndex = sections.findIndex((s) => s.id === currentSection);

  const scrollToSection = (ref: RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      scrollToSection(sections[currentIndex - 1].ref);
    }
  };

  const goToNext = () => {
    if (currentIndex < sections.length - 1) {
      scrollToSection(sections[currentIndex + 1].ref);
    }
  };

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < sections.length - 1;

  // Base button styles (DRY principle)
  const baseButtonClasses =
    "min-w-[56px] h-14 px-4 rounded-full shadow-lg transition-all flex items-center justify-center gap-2 touch-manipulation active:scale-95";
  const enabledClasses = "bg-accent hover:bg-accent/90 text-gray-900";
  const disabledClasses = "bg-gray-700 opacity-40 cursor-not-allowed";

  return (
    <nav
      className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 z-40 pb-safe"
      aria-label="Section navigation"
    >
      <div className="flex gap-3 bg-surface/80 backdrop-blur-md rounded-full p-2 border border-border shadow-2xl">
        <button
          onClick={goToPrevious}
          disabled={!hasPrevious}
          className={`${baseButtonClasses} ${
            hasPrevious ? enabledClasses : disabledClasses
          }`}
          aria-label="Previous section"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 15l7-7 7 7"
            />
          </svg>
          <span className="text-sm font-medium hidden sm:inline">Up</span>
        </button>

        <button
          onClick={goToNext}
          disabled={!hasNext}
          className={`${baseButtonClasses} ${
            hasNext ? enabledClasses : disabledClasses
          }`}
          aria-label="Next section"
        >
          <span className="text-sm font-medium hidden sm:inline">Down</span>
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>
    </nav>
  );
}
