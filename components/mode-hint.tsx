"use client";

import { useFourCornersStore } from "@/lib/store";

export function ModeHint() {
  const mode = useFourCornersStore((state) => state.mode);

  const modeConfig = {
    minimal: {
      dots: 1,
      label: "Minimal",
      desc: "Authorship required + choose 1-2 additional corners to complete",
    },
    standard: {
      dots: 3,
      label: "Standard",
      desc: "All four corners available for entry — use what you need",
    },
    complete: {
      dots: 4,
      label: "Complete",
      desc: "All corners + subject protection fields for NGO/documentary work",
    },
  };

  const config = modeConfig[mode];

  // Color mapping for each dot based on mode
  const getDotColor = (index: number) => {
    if (mode === "minimal") {
      return "bg-corner-creativeCommons"; // Orange for authorship
    } else if (mode === "standard") {
      const colors = [
        "bg-corner-backstory",
        "bg-corner-context",
        "bg-corner-links",
      ];
      return colors[index] || "bg-accent";
    } else {
      const colors = [
        "bg-corner-backstory",
        "bg-corner-context",
        "bg-corner-links",
        "bg-corner-creativeCommons",
      ];
      return colors[index] || "bg-accent";
    }
  };

  const getTitleColor = () => {
    if (mode === "minimal")
      return "text-orange-600 dark:text-corner-creativeCommons";
    return "text-cyan-600 dark:text-accent";
  };

  return (
    <div className="mb-4 px-3 py-2.5 rounded-lg bg-surface border border-border/50">
      <div className="flex items-start gap-2">
        {/* Visual dot indicator */}
        <div className="flex items-center gap-0.5 flex-shrink-0 pt-0.5">
          {Array.from({ length: config.dots }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${getDotColor(i)}`}
              title={`${config.dots} corners active`}
            />
          ))}
        </div>

        {/* Mode description */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-semibold mb-0.5 leading-tight ${getTitleColor()}`}
          >
            {config.label} Mode
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
            {config.desc}
          </p>
        </div>
      </div>
    </div>
  );
}
