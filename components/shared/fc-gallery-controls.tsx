"use client";

import { useState, useEffect } from "react";
import { Settings, LayoutGrid, Rows3 } from "lucide-react";

export interface GalleryPreferences {
  direction: "vertical" | "horizontal";
  showCaption: boolean;
  showBackstory: boolean;
  showAuthor: boolean;
  showDate: boolean;
  showCornerIndicators: boolean;
}

const DEFAULT_PREFERENCES: GalleryPreferences = {
  direction: "vertical",
  showCaption: true,
  showBackstory: false,
  showAuthor: true,
  showDate: true,
  showCornerIndicators: true,
};

const STORAGE_KEY = "fc-gallery-preferences";

export interface FCGalleryControlsProps {
  preferences: GalleryPreferences;
  onPreferencesChange: (prefs: GalleryPreferences) => void;
}

/**
 * Load preferences from localStorage
 */
export function loadGalleryPreferences(): GalleryPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn("Failed to load gallery preferences:", e);
  }
  return DEFAULT_PREFERENCES;
}

/**
 * Save preferences to localStorage
 */
export function saveGalleryPreferences(prefs: GalleryPreferences): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn("Failed to save gallery preferences:", e);
  }
}

/**
 * Gallery controls for scroll direction and display options.
 */
export function FCGalleryControls({
  preferences,
  onPreferencesChange,
}: FCGalleryControlsProps) {
  const [showSettings, setShowSettings] = useState(false);

  const updatePref = <K extends keyof GalleryPreferences>(
    key: K,
    value: GalleryPreferences[K]
  ) => {
    const newPrefs = { ...preferences, [key]: value };
    onPreferencesChange(newPrefs);
    saveGalleryPreferences(newPrefs);
  };

  // Close settings on outside click
  useEffect(() => {
    if (!showSettings) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".fc-controls__settings-panel") && !target.closest(".fc-controls__settings-btn")) {
        setShowSettings(false);
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showSettings]);

  return (
    <div className="fc-controls">
      {/* Direction toggle */}
      <div className="fc-controls__direction">
        <button
          className={`fc-controls__dir-btn ${preferences.direction === "vertical" ? "fc-controls__dir-btn--active" : ""}`}
          onClick={() => updatePref("direction", "vertical")}
          aria-label="Vertical scroll"
          title="Vertical scroll"
        >
          <Rows3 size={18} />
        </button>
        <button
          className={`fc-controls__dir-btn ${preferences.direction === "horizontal" ? "fc-controls__dir-btn--active" : ""}`}
          onClick={() => updatePref("direction", "horizontal")}
          aria-label="Horizontal scroll"
          title="Horizontal scroll"
        >
          <LayoutGrid size={18} />
        </button>
      </div>

      {/* Settings dropdown */}
      <div className="fc-controls__settings">
        <button
          className="fc-controls__settings-btn"
          onClick={() => setShowSettings(!showSettings)}
          aria-label="Display settings"
          aria-expanded={showSettings}
        >
          <Settings size={18} />
        </button>

        {showSettings && (
          <div className="fc-controls__settings-panel">
            <div className="fc-controls__settings-header">Display Options</div>

            <label className="fc-controls__checkbox">
              <input
                type="checkbox"
                checked={preferences.showCaption}
                onChange={(e) => updatePref("showCaption", e.target.checked)}
              />
              <span>Caption</span>
            </label>

            <label className="fc-controls__checkbox">
              <input
                type="checkbox"
                checked={preferences.showBackstory}
                onChange={(e) => updatePref("showBackstory", e.target.checked)}
              />
              <span>Backstory preview</span>
            </label>

            <label className="fc-controls__checkbox">
              <input
                type="checkbox"
                checked={preferences.showAuthor}
                onChange={(e) => updatePref("showAuthor", e.target.checked)}
              />
              <span>Author</span>
            </label>

            <label className="fc-controls__checkbox">
              <input
                type="checkbox"
                checked={preferences.showDate}
                onChange={(e) => updatePref("showDate", e.target.checked)}
              />
              <span>Date</span>
            </label>

            <label className="fc-controls__checkbox">
              <input
                type="checkbox"
                checked={preferences.showCornerIndicators}
                onChange={(e) => updatePref("showCornerIndicators", e.target.checked)}
              />
              <span>Corner indicators</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
