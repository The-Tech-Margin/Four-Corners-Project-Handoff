"use client";

import { useState, useCallback } from "react";
import { useFourCornersStore } from "@/lib/store";
import { reverseGeocode } from "@/utils/reverseGeocode";
import type { LocationData } from "@/lib/field-registry";

export function LocationCapture() {
  const {
    location,
    excludeLocationFromExport,
    updateLocation,
    toggleExcludeLocation,
  } = useFourCornersStore();
  const [status, setStatus] = useState<
    "idle" | "requesting" | "geocoding" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");
  const [showAddress, setShowAddress] = useState(false);

  // Update a single address field and persist to store
  const updateAddressField = useCallback(
    (field: string, value: string) => {
      const base: LocationData = location || {
        latitude: 0,
        longitude: 0,
        source: "manual" as const,
      };
      const currentAddress = base.address || {};
      updateLocation({
        ...base,
        address: {
          ...currentAddress,
          [field]: value || undefined,
        },
      });
    },
    [location, updateLocation],
  );

  const captureLocation = async () => {
    setStatus("requesting");
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setStatus("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        setStatus("geocoding");

        const geocoded = await reverseGeocode(latitude, longitude);

        updateLocation({
          latitude,
          longitude,
          city: geocoded.city,
          state: geocoded.state,
          country: geocoded.country,
          formattedLocation: geocoded.formattedLocation,
          capturedAt: new Date().toISOString(),
          source: "device",
        });

        setStatus("success");
        setTimeout(() => setStatus("idle"), 3000);
      },
      (err) => {
        let errorMsg = "Unable to retrieve location";
        if (err.code === 1) {
          errorMsg = "Location permission denied";
        } else if (err.code === 2) {
          errorMsg = "Location unavailable";
        } else if (err.code === 3) {
          errorMsg = "Location request timed out";
        }
        setError(errorMsg);
        setStatus("error");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const clearLocation = () => {
    updateLocation(undefined);
    setStatus("idle");
    setError(null);
  };

  const handleManualEntry = async () => {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);

    if (isNaN(lat) || isNaN(lon)) {
      setError("Invalid coordinates");
      setStatus("error");
      return;
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setError("Coordinates out of range (lat: -90 to 90, lon: -180 to 180)");
      setStatus("error");
      return;
    }

    setStatus("geocoding");
    const geocoded = await reverseGeocode(lat, lon);

    updateLocation({
      latitude: lat,
      longitude: lon,
      city: geocoded.city,
      state: geocoded.state,
      country: geocoded.country,
      formattedLocation: geocoded.formattedLocation,
      capturedAt: new Date().toISOString(),
      source: "manual",
    });

    setStatus("success");
    setShowManualEntry(false);
    setManualLat("");
    setManualLon("");
    setTimeout(() => setStatus("idle"), 3000);
  };

  return (
    <section className="mb-4 sm:mb-6">
      <div className="flex items-center gap-2 mb-2">
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
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <h3 className="text-sm font-medium text-gray-300">Location</h3>
      </div>
      <p className="text-xs text-gray-700 dark:text-gray-500 mb-3">
        Where the photograph was taken (not where metadata is being entered)
      </p>
      <div className="mb-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-gray-900 dark:text-orange-300 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-xs text-gray-900 dark:text-orange-300 leading-relaxed">
            Location data can be disabled to protect photographer safety and
            vulnerable subjects. Only include if appropriate for your context.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {/* Address section - first field */}
        <div className="border border-border/30 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAddress(!showAddress)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-surface-alt/30 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              {location?.address && Object.values(location.address).some(Boolean) ? "Address" : "Add Address"}
            </span>
            <svg className={`w-3 h-3 transition-transform ${showAddress ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Address summary when collapsed */}
          {!showAddress && location?.address && Object.values(location.address).some(Boolean) && (
            <div className="px-3 pb-2 text-xs text-gray-500">
              {[location.address.street, location.address.street2, location.address.district, location.address.city, location.address.stateProvince, location.address.postalCode, location.address.country].filter(Boolean).join(", ")}
            </div>
          )}

          {/* Address form when expanded */}
          {showAddress && (
            <div className="px-3 pb-3 space-y-2 border-t border-border/20">
              <p className="text-xs text-gray-600 pt-2">All fields optional — fill in what applies.</p>
              <input
                type="text"
                value={location?.address?.country || location?.country || ""}
                onChange={(e) => updateAddressField("country", e.target.value)}
                placeholder="Country"
                className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-gray-200 border border-border/50 focus:border-accent/50 focus:outline-none"
              />
              <input
                type="text"
                value={location?.address?.street || ""}
                onChange={(e) => updateAddressField("street", e.target.value)}
                placeholder="Address line 1"
                className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-gray-200 border border-border/50 focus:border-accent/50 focus:outline-none"
              />
              <input
                type="text"
                value={location?.address?.street2 || ""}
                onChange={(e) => updateAddressField("street2", e.target.value)}
                placeholder="Address line 2"
                className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-gray-200 border border-border/50 focus:border-accent/50 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={location?.address?.city || location?.city || ""}
                  onChange={(e) => updateAddressField("city", e.target.value)}
                  placeholder="City / Town / Locality"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-gray-200 border border-border/50 focus:border-accent/50 focus:outline-none"
                />
                <input
                  type="text"
                  value={location?.address?.district || ""}
                  onChange={(e) => updateAddressField("district", e.target.value)}
                  placeholder="District / Neighborhood"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-gray-200 border border-border/50 focus:border-accent/50 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={location?.address?.stateProvince || location?.state || ""}
                  onChange={(e) => updateAddressField("stateProvince", e.target.value)}
                  placeholder="Region / State / Province"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-gray-200 border border-border/50 focus:border-accent/50 focus:outline-none"
                />
                <input
                  type="text"
                  value={location?.address?.postalCode || ""}
                  onChange={(e) => updateAddressField("postalCode", e.target.value)}
                  placeholder="Postal code"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-gray-200 border border-border/50 focus:border-accent/50 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* GPS coordinates display */}
        {location && (
          <div className="space-y-2 p-3 bg-surface-alt rounded-lg border border-border/30">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                {location.formattedLocation && (
                  <div className="text-xs text-gray-200">
                    {location.formattedLocation}
                  </div>
                )}
                <div className="text-xs text-gray-500 font-mono">
                  {typeof location.latitude === "number"
                    ? location.latitude.toFixed(6)
                    : location.latitude}
                  ,{" "}
                  {typeof location.longitude === "number"
                    ? location.longitude.toFixed(6)
                    : location.longitude}
                </div>
                {location.capturedAt && (
                  <div className="text-xs text-gray-600">
                    Captured {new Date(location.capturedAt).toLocaleString()}
                    {location.source && ` · ${location.source}`}
                  </div>
                )}
              </div>
              <button
                onClick={clearLocation}
                className="text-gray-500 hover:text-gray-300 transition-colors p-1"
                aria-label="Clear location"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* GPS capture buttons - always visible */}
        {status === "idle" && !showManualEntry && (
          <>
            <button
              onClick={captureLocation}
              className="w-full py-2 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-surface-alt/50 rounded-lg transition-all flex items-center justify-center gap-1.5 border border-border/50 hover:border-border"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {location ? "Update Location" : "Capture Current Location"}
            </button>
            <button
              onClick={() => setShowManualEntry(true)}
              className="w-full py-2 text-xs font-medium text-gray-500 hover:text-gray-400 hover:bg-surface-alt/30 rounded-lg transition-all flex items-center justify-center gap-1.5"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Enter Coordinates Manually
            </button>
          </>
        )}

        {showManualEntry && (
          <div className="space-y-2 p-3 bg-surface-alt rounded-lg border border-border/30">
            <p className="text-xs text-gray-400 mb-2">Enter GPS coordinates</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="Latitude"
                className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-gray-200 border border-border/50 focus:border-accent/50 focus:outline-none font-mono"
              />
              <input
                type="text"
                value={manualLon}
                onChange={(e) => setManualLon(e.target.value)}
                placeholder="Longitude"
                className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-gray-200 border border-border/50 focus:border-accent/50 focus:outline-none font-mono"
              />
            </div>
            <p className="text-xs text-gray-600">Example: 40.7128, -74.0060</p>
            <div className="flex gap-2">
              <button
                onClick={handleManualEntry}
                className="flex-1 py-2 text-xs font-medium text-gray-300 bg-surface hover:bg-surface-alt rounded-lg transition-colors border border-border/50"
              >
                Save Location
              </button>
              <button
                onClick={() => {
                  setShowManualEntry(false);
                  setManualLat("");
                  setManualLon("");
                  setError(null);
                }}
                className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {status === "requesting" && (
          <div className="py-3 text-xs text-gray-500 italic text-center">
            Requesting location permission...
          </div>
        )}

        {status === "geocoding" && (
          <div className="py-3 text-xs text-gray-500 italic text-center">
            Looking up location details...
          </div>
        )}

        {status === "success" && (
          <div className="py-2 px-3 bg-corner-context/15 text-corner-context text-xs rounded-lg flex items-center justify-center gap-1.5">
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Location captured
          </div>
        )}

        {status === "error" && error && (
          <div className="py-2 px-3 bg-orange-500/15 text-orange-700 dark:text-orange-400 text-xs rounded-lg">
            {error}
          </div>
        )}

        <label className="flex items-start gap-3 cursor-pointer group p-2 rounded-lg hover:bg-surface-alt/30 transition-colors">
          <input
            type="checkbox"
            checked={excludeLocationFromExport}
            onChange={toggleExcludeLocation}
            className="w-4 h-4 mt-0.5 rounded bg-surface-alt border-border text-orange-500 focus:ring-orange-500/30"
          />
          <div className="flex-1">
            <span className="text-sm text-gray-300 group-hover:text-gray-200">
              Exclude location from export
            </span>
            <p className="text-xs text-gray-600 mt-0.5">
              Keep location for your records but don't include in published
              metadata
            </p>
          </div>
        </label>
      </div>
    </section>
  );
}
