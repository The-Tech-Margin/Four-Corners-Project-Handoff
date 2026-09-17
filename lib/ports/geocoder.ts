/**
 * Reverse geocoding for photo coordinates. Optional: when it is off the
 * editor still accepts a location typed by hand.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export interface GeocodedLocation {
  city: string | null;
  state: string | null;
  country: string | null;
  formattedLocation: string | null;
}

export interface GeocoderPort {
  readonly capabilities: { reverse: boolean };
  reverse(latitude: number, longitude: number): Promise<GeocodedLocation | null>;
}
