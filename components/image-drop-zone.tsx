"use client";

import { useState, useRef, useMemo } from "react";
import { useFourCornersStore } from "@/lib/store";
import {
  extractPhotoMetadata,
  type ExtractedMetadata,
} from "@/utils/extractPhotoMetadata";
import { reverseGeocode, type GeocodedLocation } from "@/utils/reverseGeocode";
import { maybeConvertHeic, isHeicFile } from "@/lib/heic-to-jpeg";
import { InteractiveImagePreview } from "./interactive-image-preview";
import { AssetLibraryModal } from "./asset-library-modal";
import type { UserAsset } from "@/lib/field-registry";
import { Library, Upload } from "lucide-react";
import { validateUpload, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/upload-limits";
import { checkQuotaForUpload } from "@/lib/db/user-storage";
import { notifyFile } from "@/lib/notify";
import { createClient } from "@/lib/supabase/client";

interface ImageDropZoneProps {
  onCornerClick?: (sectionId: string) => void;
}

export function ImageDropZone({ onCornerClick }: ImageDropZoneProps = {}) {
  const {
    imageSrc,
    setImageSrc,
    setMainImageFromStorage,
    updateBackStory,
    updateCreativeCommons,
    updateLocation,
    updatePhotoMetadata,
  } = useFourCornersStore();

  // Get stored photo metadata from Zustand (populated when loading existing projects)
  const storedPhotoMetadata = useFourCornersStore((state) => state.photoMetadata);
  const storedLocation = useFourCornersStore((state) => state.location);

  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [freshExtractedMetadata, setFreshExtractedMetadata] =
    useState<ExtractedMetadata | null>(null);
  const [geocodedLocation, setGeocodedLocation] =
    useState<GeocodedLocation | null>(null);
  const [geocodeStatus, setGeocodeStatus] = useState<
    "idle" | "loading" | "complete" | "failed"
  >("idle");

  // Convert stored photoMetadata to ExtractedMetadata format for display
  // This allows the EXIF panel to show data from existing projects loaded from database
  const extractedMetadata = useMemo<ExtractedMetadata | null>(() => {
    // Prefer freshly extracted metadata (from new upload)
    if (freshExtractedMetadata) {
      return freshExtractedMetadata;
    }

    // Fall back to stored metadata from database
    if (storedPhotoMetadata) {
      // Helper to convert undefined to null for type compatibility
      const toNull = <T,>(val: T | undefined): T | null => val ?? null;
      // Helper to coerce string|number to number (DB may store either)
      const toNumber = (val: string | number | null | undefined): number | null => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'number') return val;
        const parsed = parseFloat(val);
        return isNaN(parsed) ? null : parsed;
      };
      // Helper to coerce string|number to string (DB may store either)
      const toString = (val: string | number | null | undefined): string | null => {
        if (val === null || val === undefined) return null;
        return String(val);
      };

      return {
        // Location (from separate location store)
        latitude: toNull(storedLocation?.latitude),
        longitude: toNull(storedLocation?.longitude),

        // Temporal (required field - must be string | null)
        dateTaken: toNull(storedPhotoMetadata.temporal?.dateTimeOriginal) || toNull(storedPhotoMetadata.dateTaken),
        dateTimeOriginal: toNull(storedPhotoMetadata.temporal?.dateTimeOriginal),
        dateTime: toNull(storedPhotoMetadata.temporal?.dateTime),
        dateTimeDigitized: toNull(storedPhotoMetadata.temporal?.dateTimeDigitized),
        dateModified: toNull(storedPhotoMetadata.temporal?.dateModified),
        offsetTimeOriginal: toNull(storedPhotoMetadata.temporal?.offsetTimeOriginal),
        offsetTime: toNull(storedPhotoMetadata.temporal?.offsetTime),
        offsetTimeDigitized: toNull(storedPhotoMetadata.temporal?.offsetTimeDigitized),
        subSecTimeOriginal: toNull(storedPhotoMetadata.temporal?.subSecTimeOriginal),
        subSecTime: toNull(storedPhotoMetadata.temporal?.subSecTime),
        subSecTimeDigitized: toNull(storedPhotoMetadata.temporal?.subSecTimeDigitized),
        gpsDateStamp: toNull(storedPhotoMetadata.temporal?.gpsDateStamp),
        gpsTimeStamp: toNull(storedPhotoMetadata.temporal?.gpsTimeStamp),

        // GPS (coerce to number since ExtractedMetadata expects number | null)
        gpsAltitude: toNumber(storedPhotoMetadata.gps?.altitude),
        gpsAltitudeRef: toNumber(storedPhotoMetadata.gps?.altitudeRef),
        gpsSpeed: toNumber(storedPhotoMetadata.gps?.speed),
        gpsSpeedRef: toString(storedPhotoMetadata.gps?.speedRef),
        gpsImgDirection: toNumber(storedPhotoMetadata.gps?.imgDirection),
        gpsImgDirectionRef: toString(storedPhotoMetadata.gps?.imgDirectionRef),
        gpsDestBearing: toNumber(storedPhotoMetadata.gps?.destBearing),
        gpsDestBearingRef: toString(storedPhotoMetadata.gps?.destBearingRef),

        // Equipment (required fields - must be type | null)
        cameraMake: toNull(storedPhotoMetadata.equipment?.cameraMake),
        cameraModel: toNull(storedPhotoMetadata.equipment?.cameraModel),
        lensModel: toNull(storedPhotoMetadata.equipment?.lensModel),
        focalLength: toNull(storedPhotoMetadata.equipment?.focalLength),
        iso: toNumber(storedPhotoMetadata.equipment?.iso),
        aperture: toNull(storedPhotoMetadata.equipment?.aperture),
        shutterSpeed: toNull(storedPhotoMetadata.equipment?.shutterSpeed),

        // Device
        software: toNull(storedPhotoMetadata.device?.software),
        hostComputer: toNull(storedPhotoMetadata.device?.hostComputer),
        artist: toNull(storedPhotoMetadata.device?.artist),
        copyright: toNull(storedPhotoMetadata.device?.copyright),
        userComment: toNull(storedPhotoMetadata.device?.userComment),
        imageDescription: toNull(storedPhotoMetadata.device?.imageDescription),

        // Image (required fields - must be type | null)
        width: toNumber(storedPhotoMetadata.image?.width),
        height: toNumber(storedPhotoMetadata.image?.height),
        orientation: toNumber(storedPhotoMetadata.image?.orientation),
      };
    }

    return null;
  }, [freshExtractedMetadata, storedPhotoMetadata, storedLocation]);

  // Sync stored location → local geocoded state when loading an existing
  // project. Using the render-phase setState pattern (guarded by a tracker)
  // avoids the cascading-renders warning that useEffect would trigger here.
  // See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [lastSyncedStoredLoc, setLastSyncedStoredLoc] = useState<string | null>(null);
  if (
    storedLocation?.formattedLocation &&
    storedLocation.formattedLocation !== lastSyncedStoredLoc &&
    !geocodedLocation &&
    !freshExtractedMetadata
  ) {
    setLastSyncedStoredLoc(storedLocation.formattedLocation);
    setGeocodedLocation({
      city: storedLocation.city ?? null,
      state: storedLocation.state ?? null,
      country: storedLocation.country ?? null,
      formattedLocation: storedLocation.formattedLocation,
    });
    setGeocodeStatus("complete");
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const handleLibraryPick = (assets: UserAsset[]) => {
    const picked = assets[0];
    if (!picked) return;
    // Library assets are already hosted. Set BOTH the URL (for rendering in
    // the editor) and the storage path (so useProjectSave can write
    // `main_image_storage_path` — the dashboard/gallery reconstruct image
    // URLs from that path and return no image when it's missing).
    setMainImageFromStorage(picked.storageUrl, picked.storagePath);
    setFreshExtractedMetadata(null);
    setGeocodedLocation(null);
    setGeocodeStatus("idle");
  };

  const performGeocode = async (lat: number, lon: number) => {
    setGeocodeStatus("loading");
    const geocoded = await reverseGeocode(lat, lon);
    setGeocodedLocation(geocoded);
    setGeocodeStatus(geocoded.formattedLocation ? "complete" : "failed");

    // Save to store
    updateLocation({
      latitude: lat,
      longitude: lon,
      city: geocoded.city,
      state: geocoded.state,
      country: geocoded.country,
      formattedLocation: geocoded.formattedLocation,
      capturedAt: new Date().toISOString(),
      source: "exif",
    });
  };

  const handleFile = async (file: File) => {
    // Accept images (incl. HEIC/HEIF — iOS often sets application/octet-stream)
    // AND videos as the primary media. The viewer renders <video controls>
    // when the src looks like a video URL; the editor preview does the same.
    const isVideo =
      file.type.startsWith("video/") ||
      /\.(mp4|webm|mov|m4v|avi|mkv|3gp|3g2|mpeg|mpg|ogv|wmv|flv|hevc|m2ts|ts)$/i.test(file.name);
    const isImage = file.type.startsWith("image/") || isHeicFile(file);
    if (!isImage && !isVideo) {
      notifyFile.invalidType(file.name);
      return;
    }

    // Pre-flight per-file size check (fires toast on fail, bails before read).
    const sizeCheck = validateUpload(file, isVideo ? "video" : "image");
    if (!sizeCheck.ok) {
      notifyFile.tooLarge(
        sizeCheck.fileName,
        sizeCheck.actualBytes,
        sizeCheck.limitBytes,
        sizeCheck.kind,
      );
      return;
    }

    // Pre-flight quota check (skipped when signed out — save flow will no-op).
    const supabase = createClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const quota = await checkQuotaForUpload(user.id, file.size);
        if (!quota.ok) {
          notifyFile.quotaExceeded(quota.used, quota.limit, quota.plan);
          return;
        }
      }
    }

    // Only show the "Extracting EXIF metadata…" spinner for images. Videos
    // skip the parser entirely (see extractPhotoMetadata) so there's nothing
    // to spin on — and showing EXIF copy for a video upload is just misleading.
    if (!isVideo) setIsExtracting(true);

    // Extract EXIF from the ORIGINAL file. extractPhotoMetadata short-circuits
    // for HEIC and video (returns empty metadata). For non-HEIC images this is
    // the same reliable path as before.
    // NOTE: we intentionally do NOT extract EXIF from the converted JPEG —
    // heic2any produces malformed EXIF sections that exifr parses as raw DMS
    // arrays, which fail Zod validation on save (location.latitude expects
    // number, not array).
    const exifData = await extractPhotoMetadata(file);
    setFreshExtractedMetadata(exifData);

    // Convert HEIC/HEIF → JPEG so the data URL we set as imageSrc (and later
    // upload to Supabase) is renderable in every browser. No-op for non-HEIC.
    const displayFile = await maybeConvertHeic(file);

    // Display image
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageSrc(e.target?.result as string);

      // Pre-populate date from EXIF or fallback to file modification date
      const date = exifData.dateTaken
        ? new Date(exifData.dateTaken).toISOString().split("T")[0]
        : new Date(file.lastModified).toISOString().split("T")[0];
      updateBackStory("date", date);

      // Save comprehensive photo metadata to store for NGO workflows
      updatePhotoMetadata({
        dateTaken: exifData.dateTaken,
        temporal: {
          dateTimeOriginal: exifData.dateTimeOriginal,
          dateTime: exifData.dateTime,
          dateTimeDigitized: exifData.dateTimeDigitized,
          dateModified: exifData.dateModified,
          offsetTimeOriginal: exifData.offsetTimeOriginal,
          offsetTime: exifData.offsetTime,
          offsetTimeDigitized: exifData.offsetTimeDigitized,
          subSecTimeOriginal: exifData.subSecTimeOriginal,
          subSecTime: exifData.subSecTime,
          subSecTimeDigitized: exifData.subSecTimeDigitized,
          gpsDateStamp: exifData.gpsDateStamp,
          gpsTimeStamp: exifData.gpsTimeStamp,
        },
        gps: {
          altitude: exifData.gpsAltitude,
          altitudeRef: exifData.gpsAltitudeRef,
          speed: exifData.gpsSpeed,
          speedRef: exifData.gpsSpeedRef,
          imgDirection: exifData.gpsImgDirection,
          imgDirectionRef: exifData.gpsImgDirectionRef,
          destBearing: exifData.gpsDestBearing,
          destBearingRef: exifData.gpsDestBearingRef,
        },
        equipment: {
          cameraMake: exifData.cameraMake,
          cameraModel: exifData.cameraModel,
          lensModel: exifData.lensModel,
          focalLength: exifData.focalLength,
          iso: exifData.iso,
          aperture: exifData.aperture,
          shutterSpeed: exifData.shutterSpeed,
        },
        device: {
          software: exifData.software,
          hostComputer: exifData.hostComputer,
          artist: exifData.artist,
          copyright: exifData.copyright,
          userComment: exifData.userComment,
          imageDescription: exifData.imageDescription,
        },
        image: {
          width: exifData.width,
          height: exifData.height,
          orientation: exifData.orientation,
        },
      });

      // Camera info is now stored in photoMetadata.equipment (see above)
      // and displayed in the dedicated Camera section of the authorship panel.
      // The creativeCommons.description field is for the user's caption/description,
      // not technical metadata.

      setIsExtracting(false);
    };
    reader.readAsDataURL(displayFile);

    // Attempt geocode if coords exist
    if (exifData.latitude && exifData.longitude) {
      performGeocode(exifData.latitude, exifData.longitude);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemoveImage = () => {
    setImageSrc("");
    setFreshExtractedMetadata(null);
    setGeocodedLocation(null);
    setGeocodeStatus("idle");
  };

  return (
    <section className="mb-4 sm:mb-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label={
          !imageSrc ? "Drop image or use the upload / library buttons" : undefined
        }
        className={`relative ${
          imageSrc ? "aspect-[4/3] sm:aspect-[3/2]" : "h-32 sm:h-40"
        } bg-surface rounded-xl sm:rounded-2xl border-2 border-dashed ${
          isDragging ? "border-accent" : "border-border"
        } transition-all overflow-hidden group`}
      >
        {isExtracting ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4 bg-surface">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-accent/10 flex items-center justify-center mb-3 sm:mb-4 animate-pulse">
              <svg
                className="w-6 h-6 sm:w-8 sm:h-8 text-accent animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <p className="text-xs sm:text-sm text-accent text-center">
              Extracting EXIF metadata...
            </p>
          </div>
        ) : !imageSrc ? (
          // z-20 so the upload/library buttons sit above InteractiveImagePreview's
          // `absolute inset-0` wrapper (which otherwise intercepts clicks).
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-4 pointer-events-none">
            <div className="flex items-center gap-2 sm:gap-3 mt-2 mb-3 sm:mb-4 pointer-events-auto">
              {/* Upload — explicit file-picker action. */}
              <button
                type="button"
                onClick={handleClick}
                title="Upload an image"
                aria-label="Upload an image"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-alt flex items-center justify-center text-gray-500 hover:text-accent hover:bg-accent/10 transition-colors"
              >
                <Upload className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.75} aria-hidden="true" />
              </button>
              {/* Library — opens the asset library modal. Matches the
                  Library icon used in AudioFileUpload / context-images. */}
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                title="Browse your library"
                aria-label="Browse your library"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-alt flex items-center justify-center text-gray-500 hover:text-accent hover:bg-accent/10 transition-colors"
              >
                <Library className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 text-center">
              Drop image, upload, or browse your library
            </p>
            <p className="text-[10px] sm:text-xs text-gray-600 text-center mt-1">
              Up to {formatBytes(MAX_UPLOAD_BYTES.image)}
            </p>
          </div>
        ) : null}
        {/* 4C corners - always rendered, panels disabled in editor */}
        <InteractiveImagePreview
          onCornerClick={(sectionId) => onCornerClick?.(sectionId)}
          showPanels={false}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.heic,.heif"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Replace/Remove buttons - shown outside viewer when image exists.
          Two replace paths (upload + library) mirror the empty-state drop
          area so users always have both options available. */}
      {imageSrc && (
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            onClick={handleClick}
            title="Replace with an upload"
            aria-label="Replace with an upload"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-accent bg-surface-alt hover:bg-surface border border-border hover:border-accent/40 rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            Upload
          </button>
          <button
            onClick={() => setLibraryOpen(true)}
            title="Replace from your library"
            aria-label="Replace from your library"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-accent bg-surface-alt hover:bg-surface border border-border hover:border-accent/40 rounded-lg transition-colors"
          >
            <Library className="w-3.5 h-3.5" aria-hidden="true" />
            Library
          </button>
          <button
            onClick={handleRemoveImage}
            title="Remove image"
            aria-label="Remove image"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-red-400 bg-surface-alt hover:bg-red-500/10 border border-border hover:border-red-500/40 rounded-lg transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Remove
          </button>
        </div>
      )}

      {extractedMetadata && imageSrc && (
        <div className="mt-3 rounded-lg border border-accent/20 p-3 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="#09fff0"
                  strokeWidth="1.5"
                />
                <rect
                  x="5"
                  y="6"
                  width="6"
                  height="4"
                  rx="0.5"
                  stroke="#09fff0"
                  strokeWidth="1.2"
                  fill="none"
                />
                <circle cx="8" cy="8" r="1" fill="#09fff0" />
              </svg>
              <span className="text-xs font-medium text-teal-700 dark:text-accent uppercase tracking-wide">
                Extracted from image
              </span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-corner-context/10 text-corner-context font-medium">
              Auto-filled
            </span>
          </div>

          <div className="space-y-2.5">
            {(extractedMetadata.latitude ||
              geocodedLocation?.formattedLocation) && (
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      stroke="#ff3b3b"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M8 5v3m0 2v.5"
                      stroke="#ff3b3b"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="8"
                      cy="7"
                      r="2"
                      stroke="#ff3b3b"
                      strokeWidth="1.2"
                      fill="none"
                    />
                  </svg>
                  <span className="text-xs text-gray-500">Location</span>
                </div>
                <span className="text-xs text-gray-200 text-right flex-1">
                  {geocodeStatus === "loading" && (
                    <span className="text-gray-500 italic">
                      Looking up location...
                    </span>
                  )}
                  {geocodeStatus === "complete" &&
                    geocodedLocation?.formattedLocation}
                  {geocodeStatus === "failed" &&
                    extractedMetadata.latitude &&
                    extractedMetadata.longitude && (
                      <div className="flex items-center gap-2 justify-end">
                        <code className="text-xs bg-surface px-1.5 py-0.5 rounded">
                          {typeof extractedMetadata.latitude === "number"
                            ? extractedMetadata.latitude.toFixed(4)
                            : extractedMetadata.latitude}
                          ,{" "}
                          {typeof extractedMetadata.longitude === "number"
                            ? extractedMetadata.longitude.toFixed(4)
                            : extractedMetadata.longitude}
                        </code>
                        <button
                          onClick={() =>
                            performGeocode(
                              extractedMetadata.latitude!,
                              extractedMetadata.longitude!,
                            )
                          }
                          className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 hover:border-accent/50 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                </span>
              </div>
            )}

            {extractedMetadata.dateTaken && (
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      stroke="#f5a623"
                      strokeWidth="1.5"
                    />
                    <rect
                      x="5"
                      y="5"
                      width="6"
                      height="6"
                      rx="0.5"
                      stroke="#f5a623"
                      strokeWidth="1.2"
                      fill="none"
                    />
                    <path
                      d="M6 4v2m4-2v2"
                      stroke="#f5a623"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-xs text-gray-500">Captured</span>
                </div>
                <span className="text-xs text-gray-200 text-right">
                  {new Date(extractedMetadata.dateTaken).toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </span>
              </div>
            )}

            {(extractedMetadata.cameraMake ||
              extractedMetadata.cameraModel) && (
              <details className="group">
                <summary className="flex items-start justify-between gap-3 cursor-pointer list-none hover:bg-surface/50 -mx-1.5 px-1.5 py-1 rounded transition-colors">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="#e91e63"
                        strokeWidth="1.5"
                      />
                      <rect
                        x="5"
                        y="6.5"
                        width="6"
                        height="3.5"
                        rx="0.5"
                        stroke="#e91e63"
                        strokeWidth="1.2"
                        fill="none"
                      />
                      <circle
                        cx="8"
                        cy="8.5"
                        r="1.2"
                        stroke="#e91e63"
                        strokeWidth="1"
                        fill="none"
                      />
                    </svg>
                    <span className="text-xs text-gray-500">Equipment</span>
                  </div>
                  <div className="flex items-center gap-1 flex-1 justify-end">
                    <span className="text-xs text-gray-200 text-right">
                      {[
                        extractedMetadata.cameraMake,
                        extractedMetadata.cameraModel,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                    <svg
                      className="w-3 h-3 text-gray-500 group-open:rotate-180 transition-transform"
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
                  </div>
                </summary>
                <div className="mt-2 ml-4 pl-3 border-l-2 border-corner-creativeCommons/20 space-y-1.5 text-[11px] text-gray-400 py-1">
                  {extractedMetadata.lensModel && (
                    <div>Lens: {extractedMetadata.lensModel}</div>
                  )}
                  {extractedMetadata.focalLength && (
                    <div>Focal length: {extractedMetadata.focalLength}</div>
                  )}
                  {extractedMetadata.aperture && (
                    <div>Aperture: {extractedMetadata.aperture}</div>
                  )}
                  {extractedMetadata.shutterSpeed && (
                    <div>Shutter: {extractedMetadata.shutterSpeed}</div>
                  )}
                  {extractedMetadata.iso && (
                    <div>ISO: {extractedMetadata.iso}</div>
                  )}
                  {extractedMetadata.orientation != null && (
                    <div>
                      Orientation:{" "}
                      {[
                        "",
                        "Normal",
                        "Flip horizontal",
                        "Rotate 180°",
                        "Flip vertical",
                        "Transpose",
                        "Rotate 90° CW",
                        "Transverse",
                        "Rotate 270° CW",
                      ][extractedMetadata.orientation] ||
                        `Code ${extractedMetadata.orientation}`}
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* GPS Extended Metadata */}
            {(extractedMetadata.gpsAltitude != null ||
              extractedMetadata.gpsSpeed != null ||
              extractedMetadata.gpsImgDirection != null) && (
              <details className="group">
                <summary className="flex items-start justify-between gap-3 cursor-pointer list-none hover:bg-surface/50 -mx-1.5 px-1.5 py-1 rounded transition-colors">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="#ff3b3b"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M8 4v4l2 2"
                        stroke="#ff3b3b"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-xs text-gray-500">GPS Details</span>
                  </div>
                  <div className="flex items-center gap-1 flex-1 justify-end">
                    <span className="text-xs text-gray-400 text-right">
                      Extended GPS data
                    </span>
                    <svg
                      className="w-3 h-3 text-gray-500 group-open:rotate-180 transition-transform"
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
                  </div>
                </summary>
                <div className="mt-2 ml-4 pl-3 border-l-2 border-corner-context/20 space-y-1.5 text-[11px] text-gray-400 py-1">
                  {extractedMetadata.gpsAltitude != null && (
                    <div>
                      Altitude:{" "}
                      {typeof extractedMetadata.gpsAltitude === "number"
                        ? extractedMetadata.gpsAltitude.toFixed(1)
                        : extractedMetadata.gpsAltitude}
                      m{" "}
                      {extractedMetadata.gpsAltitudeRef === 0
                        ? "above"
                        : "below"}{" "}
                      sea level
                    </div>
                  )}
                  {extractedMetadata.gpsSpeed != null && (
                    <div>
                      Speed:{" "}
                      {typeof extractedMetadata.gpsSpeed === "number"
                        ? extractedMetadata.gpsSpeed.toFixed(2)
                        : extractedMetadata.gpsSpeed}{" "}
                      {extractedMetadata.gpsSpeedRef || "km/h"}
                    </div>
                  )}
                  {extractedMetadata.gpsImgDirection != null && (
                    <div>
                      Camera direction:{" "}
                      {typeof extractedMetadata.gpsImgDirection === "number"
                        ? extractedMetadata.gpsImgDirection.toFixed(1)
                        : extractedMetadata.gpsImgDirection}
                      ° {extractedMetadata.gpsImgDirectionRef || "T"}
                    </div>
                  )}
                  {extractedMetadata.gpsDestBearing != null && (
                    <div>
                      Destination bearing:{" "}
                      {typeof extractedMetadata.gpsDestBearing === "number"
                        ? extractedMetadata.gpsDestBearing.toFixed(1)
                        : extractedMetadata.gpsDestBearing}
                      ° {extractedMetadata.gpsDestBearingRef || "T"}
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Temporal Metadata */}
            {(extractedMetadata.dateTimeDigitized ||
              extractedMetadata.dateModified ||
              extractedMetadata.offsetTimeOriginal ||
              extractedMetadata.gpsDateStamp) && (
              <details className="group">
                <summary className="flex items-start justify-between gap-3 cursor-pointer list-none hover:bg-surface/50 -mx-1.5 px-1.5 py-1 rounded transition-colors">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="#f5a623"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M8 4v4h3"
                        stroke="#f5a623"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-xs text-gray-500">
                      Temporal Details
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-1 justify-end">
                    <span className="text-xs text-gray-400 text-right">
                      Extended date/time
                    </span>
                    <svg
                      className="w-3 h-3 text-gray-500 group-open:rotate-180 transition-transform"
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
                  </div>
                </summary>
                <div className="mt-2 ml-4 pl-3 border-l-2 border-corner-links/20 space-y-1.5 text-[11px] text-gray-400 py-1">
                  {extractedMetadata.dateTimeOriginal && (
                    <div>
                      Original:{" "}
                      {new Date(
                        extractedMetadata.dateTimeOriginal,
                      ).toLocaleString()}
                    </div>
                  )}
                  {extractedMetadata.dateTimeDigitized && (
                    <div>
                      Digitized:{" "}
                      {new Date(
                        extractedMetadata.dateTimeDigitized,
                      ).toLocaleString()}
                    </div>
                  )}
                  {extractedMetadata.dateModified && (
                    <div>
                      Modified:{" "}
                      {new Date(
                        extractedMetadata.dateModified,
                      ).toLocaleString()}
                    </div>
                  )}
                  {extractedMetadata.offsetTimeOriginal && (
                    <div>
                      Timezone: UTC{extractedMetadata.offsetTimeOriginal}
                    </div>
                  )}
                  {extractedMetadata.subSecTimeOriginal && (
                    <div>
                      Subsecond precision: .
                      {extractedMetadata.subSecTimeOriginal}s
                    </div>
                  )}
                  {extractedMetadata.gpsDateStamp && (
                    <div>GPS Date: {extractedMetadata.gpsDateStamp}</div>
                  )}
                  {extractedMetadata.gpsTimeStamp && (
                    <div>GPS Time: {extractedMetadata.gpsTimeStamp}</div>
                  )}
                </div>
              </details>
            )}

            {/* Device & Software Metadata */}
            {(extractedMetadata.software ||
              extractedMetadata.hostComputer ||
              extractedMetadata.artist ||
              extractedMetadata.copyright ||
              extractedMetadata.userComment ||
              extractedMetadata.imageDescription) && (
              <details className="group">
                <summary className="flex items-start justify-between gap-3 cursor-pointer list-none hover:bg-surface/50 -mx-1.5 px-1.5 py-1 rounded transition-colors">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="10"
                        height="8"
                        rx="1"
                        stroke="#09fff0"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <path
                        d="M6 11v2h4v-2"
                        stroke="#09fff0"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-xs text-gray-500">
                      Device & Software
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-1 justify-end">
                    <span className="text-xs text-gray-400 text-right">
                      Creator & processing
                    </span>
                    <svg
                      className="w-3 h-3 text-gray-500 group-open:rotate-180 transition-transform"
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
                  </div>
                </summary>
                <div className="mt-2 ml-4 pl-3 border-l-2 border-accent/20 space-y-1.5 text-[11px] text-gray-400 py-1">
                  {extractedMetadata.software && (
                    <div>Software: {extractedMetadata.software}</div>
                  )}
                  {extractedMetadata.hostComputer && (
                    <div>Host: {extractedMetadata.hostComputer}</div>
                  )}
                  {extractedMetadata.artist && (
                    <div>Artist: {extractedMetadata.artist}</div>
                  )}
                  {extractedMetadata.copyright && (
                    <div>Copyright: {extractedMetadata.copyright}</div>
                  )}
                  {extractedMetadata.imageDescription && (
                    <div>Description: {extractedMetadata.imageDescription}</div>
                  )}
                  {extractedMetadata.userComment && (
                    <div>Comment: {extractedMetadata.userComment}</div>
                  )}
                </div>
              </details>
            )}

            {/* Image Properties */}
            {(extractedMetadata.width ||
              extractedMetadata.height ||
              extractedMetadata.orientation) && (
              <details className="group hover:bg-surface/50 transition-colors">
                <summary className="flex items-start justify-between gap-3 cursor-pointer list-none -mx-1.5 px-1.5 py-1 rounded">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <rect
                        x="3"
                        y="4"
                        width="10"
                        height="8"
                        rx="1"
                        stroke="#e91e63"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <circle cx="6" cy="7" r="1" fill="#e91e63" />
                      <path
                        d="M3 10l3-2 2 1.5 5-3"
                        stroke="#e91e63"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-xs text-gray-500">
                      Image Properties
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-1 justify-end">
                    <span className="text-xs text-gray-400 text-right">
                      {extractedMetadata.width && extractedMetadata.height
                        ? `${extractedMetadata.width}×${extractedMetadata.height}`
                        : "Dimensions"}
                    </span>
                    <svg
                      className="w-3 h-3 text-gray-500 group-open:rotate-180 transition-transform"
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
                  </div>
                </summary>
                <div className="mt-2 ml-4 pl-3 border-l-2 border-corner-creativeCommons/20 space-y-1.5 text-[11px] text-gray-400 py-1">
                  {extractedMetadata.width && extractedMetadata.height && (
                    <div>
                      Dimensions: {extractedMetadata.width} ×{" "}
                      {extractedMetadata.height} pixels
                    </div>
                  )}
                  {extractedMetadata.width && extractedMetadata.height && (
                    <div>
                      Aspect ratio:{" "}
                      {typeof extractedMetadata.width === "number" &&
                      typeof extractedMetadata.height === "number"
                        ? (
                            extractedMetadata.width / extractedMetadata.height
                          ).toFixed(2)
                        : `${extractedMetadata.width}/${extractedMetadata.height}`}
                      :1
                    </div>
                  )}
                  {extractedMetadata.orientation !== null && (
                    <div>
                      Orientation:{" "}
                      {[
                        "",
                        "Normal",
                        "Flip horizontal",
                        "Rotate 180°",
                        "Flip vertical",
                        "Transpose",
                        "Rotate 90° CW",
                        "Transverse",
                        "Rotate 270° CW",
                      ][extractedMetadata.orientation] ||
                        `Code ${extractedMetadata.orientation}`}
                    </div>
                  )}
                </div>
              </details>
            )}

            {!extractedMetadata.dateTaken &&
              !extractedMetadata.latitude &&
              !extractedMetadata.cameraMake && (
                <div className="text-xs text-gray-600 italic text-center py-2">
                  No embedded metadata found in this image
                </div>
              )}
          </div>
        </div>
      )}

      <AssetLibraryModal
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={handleLibraryPick}
        multiSelect={false}
        // Visual library — images and videos both live here. Video main-images
        // still set imageSrc to the asset's storageUrl; downstream rendering
        // handles the URL uniformly.
        allowedTypes={["image", "video"]}
        title="Pick from your visual library"
      />
    </section>
  );
}
