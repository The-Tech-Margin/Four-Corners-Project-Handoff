"use client";

import { useState } from "react";
import { useFourCornersStore } from "@/lib/store";

export function CameraMetadata() {
  const { photoMetadata, location, includeExifInExport, toggleIncludeExif } =
    useFourCornersStore();
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if there's any EXIF data to display
  const hasExifData =
    photoMetadata?.equipment ||
    photoMetadata?.temporal ||
    photoMetadata?.gps ||
    location;

  if (!hasExifData) return null;

  return (
    <section className="mb-4 sm:mb-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h3 className="text-sm font-medium text-gray-300">
            Camera Metadata (EXIF)
          </h3>
          <span className="text-xs text-gray-600 bg-surface-alt px-1.5 py-0.5 rounded">
            Read-only
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-gray-500 hover:text-gray-400 transition-colors flex items-center gap-1"
        >
          <span>{isExpanded ? "Hide" : "Show"}</span>
          <svg
            className={`w-3 h-3 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      <p className="text-xs text-gray-600 mb-3">
        Technical data extracted from image file
      </p>

      {isExpanded && (
        <div className="space-y-3">
          <div className="p-3 bg-surface-alt/30 rounded-lg border border-border/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Camera Equipment */}
              {photoMetadata?.equipment?.cameraMake && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Camera</div>
                  <div className="text-sm text-gray-300 font-mono">
                    {photoMetadata.equipment.cameraMake}{" "}
                    {photoMetadata.equipment.cameraModel}
                  </div>
                </div>
              )}

              {photoMetadata?.equipment?.lensModel && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Lens</div>
                  <div className="text-sm text-gray-300 font-mono">
                    {photoMetadata.equipment.lensModel}
                  </div>
                </div>
              )}

              {photoMetadata?.equipment?.focalLength && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Focal Length</div>
                  <div className="text-sm text-gray-300 font-mono">
                    {photoMetadata.equipment.focalLength}
                  </div>
                </div>
              )}

              {photoMetadata?.equipment?.aperture && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Aperture</div>
                  <div className="text-sm text-gray-300 font-mono">
                    {photoMetadata.equipment.aperture}
                  </div>
                </div>
              )}

              {photoMetadata?.equipment?.shutterSpeed && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    Shutter Speed
                  </div>
                  <div className="text-sm text-gray-300 font-mono">
                    {photoMetadata.equipment.shutterSpeed}
                  </div>
                </div>
              )}

              {photoMetadata?.equipment?.iso && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">ISO</div>
                  <div className="text-sm text-gray-300 font-mono">
                    {photoMetadata.equipment.iso}
                  </div>
                </div>
              )}

              {/* Date/Time */}
              {photoMetadata?.temporal?.dateTimeOriginal && (
                <div className="sm:col-span-2">
                  <div className="text-xs text-gray-500 mb-1">
                    Date/Time Captured
                  </div>
                  <div className="text-sm text-gray-300 font-mono">
                    {new Date(
                      photoMetadata.temporal.dateTimeOriginal
                    ).toLocaleString()}
                  </div>
                </div>
              )}

              {/* GPS from EXIF (if different from location capture) */}
              {photoMetadata?.gps &&
                (photoMetadata.gps.altitude !== null ||
                  photoMetadata.gps.speed !== null) && (
                  <div className="sm:col-span-2">
                    <div className="text-xs text-gray-500 mb-1">
                      GPS Metadata
                    </div>
                    <div className="text-sm text-gray-300 font-mono space-y-1">
                      {photoMetadata.gps.altitude !== null && (
                        <div>Altitude: {photoMetadata.gps.altitude}m</div>
                      )}
                      {photoMetadata.gps.speed !== null && (
                        <div>
                          Speed: {photoMetadata.gps.speed}{" "}
                          {photoMetadata.gps.speedRef || "km/h"}
                        </div>
                      )}
                      {photoMetadata.gps.imgDirection !== null && (
                        <div>Direction: {photoMetadata.gps.imgDirection}°</div>
                      )}
                    </div>
                  </div>
                )}
            </div>
          </div>

          {/* Include in export toggle */}
          <label className="flex items-start gap-3 cursor-pointer group p-2 rounded-lg hover:bg-surface-alt/30 transition-colors">
            <input
              type="checkbox"
              checked={includeExifInExport}
              onChange={toggleIncludeExif}
              className="w-4 h-4 mt-0.5 rounded bg-surface-alt border-border text-accent focus:ring-accent/30"
            />
            <div className="flex-1">
              <span className="text-sm text-gray-300 group-hover:text-gray-200">
                Include EXIF in export
              </span>
              <p className="text-xs text-gray-600 mt-0.5">
                Uncheck to strip technical metadata from published file
              </p>
            </div>
          </label>
        </div>
      )}
    </section>
  );
}
