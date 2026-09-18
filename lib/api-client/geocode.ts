/**
 * Reverse geocoding through the server, so no third party sees a visitor's
 * address. Returns null when the deployment has no geocoder.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { GeocodedLocation } from "@/lib/ports/geocoder";
import { apiGet } from "./http";

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodedLocation | null> {
  try {
    const { location } = await apiGet<{ location: GeocodedLocation | null }>(
      `/api/geocode/reverse?lat=${latitude}&lon=${longitude}`,
    );
    return location;
  } catch {
    return null;
  }
}
