"use client";

import { useState, useEffect, RefObject } from "react";

interface Section {
  id: string;
  label: string;
  color: string;
  ref: RefObject<HTMLDivElement | null>;
  isPopulated?: boolean;
}

interface SectionProgressProps {
  sections: Section[];
}

export function SectionProgress({ sections }: SectionProgressProps) {
  const [currentSection, setCurrentSection] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight / 3;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        const element = section.ref.current;
        if (element) {
          const rect = element.getBoundingClientRect();
          const elementTop = rect.top + window.scrollY;

          if (scrollPosition >= elementTop) {
            setCurrentSection(i);
            break;
          }
        }
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  const scrollToSection = (index: number) => {
    const section = sections[index];
    section.ref.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const nextSection =
    currentSection < sections.length - 1 ? currentSection + 1 : null;

  return (
    <nav
      className="fixed right-4 top-1/2 -translate-y-1/2 z-30 hidden md:flex flex-col items-center gap-3"
      aria-label="Section navigation"
    >
      {sections.map((section, index) => {
        const isActive = index === currentSection;
        const isPast = index < currentSection;
        const isPopulated = section.isPopulated;

        return (
          <button
            key={section.id}
            onClick={() => scrollToSection(index)}
            className="group relative cursor-pointer hover:scale-125 transition-transform"
            aria-label={`Go to ${section.label}`}
            title={section.label}
          >
            {/* Progress indicator */}
            {isPopulated ? (
              // Filled dot for populated sections
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  isActive
                    ? `${section.color} scale-150 shadow-lg`
                    : isPast
                    ? `${section.color} opacity-80 group-hover:opacity-100`
                    : `${section.color} opacity-70 group-hover:opacity-100`
                }`}
              />
            ) : (
              // Outline dot for empty sections
              <div
                className={`w-2 h-2 rounded-full border transition-all duration-300 ${
                  isActive
                    ? `border-2 ${section.color.replace(
                        "bg-",
                        "border-"
                      )} scale-150`
                    : `border ${section.color.replace(
                        "bg-",
                        "border-"
                      )} opacity-60 group-hover:opacity-100`
                }`}
              />
            )}

            {/* Label on hover */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 fc-focus-reveal transition-opacity pointer-events-none whitespace-nowrap">
              <div className="bg-surface/95 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 shadow-lg">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${section.color}`}
                  />
                  <span className="text-xs text-gray-300">{section.label}</span>
                </div>
              </div>
            </div>
          </button>
        );
      })}

      {/* Next section arrow */}
      {nextSection !== null && (
        <button
          onClick={() => scrollToSection(nextSection)}
          className="mt-2 w-6 h-6 flex items-center justify-center group"
          aria-label={`Next: ${sections[nextSection].label}`}
          title={`Next: ${sections[nextSection].label}`}
        >
          <svg
            className={`w-4 h-4 ${sections[nextSection].color.replace(
              "bg-",
              "text-"
            )} opacity-60 group-hover:opacity-100 transition-all group-hover:translate-y-0.5`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      )}
    </nav>
  );
}
