/**
 * Geocoder stub.
 *
 * A production adapter turns coordinates into a place name. Whatever service
 * you choose, respect its usage policy and attribution terms.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { NotConfiguredError } from "@/lib/ports/errors";
import type { GeocoderPort } from "@/lib/ports/geocoder";

const fail = (): never => {
  throw new NotConfiguredError(
    "GeocoderPort",
    "FC_GEOCODER_ADAPTER",
    "Implement lib/ports/geocoder.ts against your geocoding service.",
  );
};

export function createStubGeocoder(): GeocoderPort {
  return {
    capabilities: { reverse: true },
    reverse: fail,
  };
}
