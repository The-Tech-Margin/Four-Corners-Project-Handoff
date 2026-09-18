/**
 * Local geocoding: unavailable, so nothing leaves the machine. Coordinates
 * still save; the place name is typed by hand.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { GeocoderPort } from "@/lib/ports/geocoder";

export function createLocalGeocoder(): GeocoderPort {
  return {
    capabilities: { reverse: false },
    async reverse() {
      return null;
    },
  };
}
