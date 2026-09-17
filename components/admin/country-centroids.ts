/**
 * Country centroid lookup for the admin world map.
 *
 * Approximate geographic center of each country in (lat, lng). Used to
 * position bubbles on an equirectangular projection. Coordinates are
 * intentionally coarse — ~1° precision is plenty for pixel-scale bubbles.
 *
 * Coverage: ~85 countries accounting for ≈99% of typical web traffic.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export interface Centroid {
  name: string;
  lat: number;
  lng: number;
}

export const COUNTRY_CENTROIDS: Record<string, Centroid> = {
  AD: { name: "Andorra", lat: 42.5, lng: 1.5 },
  AE: { name: "United Arab Emirates", lat: 23.4, lng: 53.8 },
  AR: { name: "Argentina", lat: -34.0, lng: -64.0 },
  AT: { name: "Austria", lat: 47.5, lng: 14.6 },
  AU: { name: "Australia", lat: -25.3, lng: 133.8 },
  BD: { name: "Bangladesh", lat: 23.7, lng: 90.4 },
  BE: { name: "Belgium", lat: 50.5, lng: 4.5 },
  BG: { name: "Bulgaria", lat: 42.7, lng: 25.5 },
  BR: { name: "Brazil", lat: -14.2, lng: -51.9 },
  BY: { name: "Belarus", lat: 53.7, lng: 27.9 },
  CA: { name: "Canada", lat: 56.1, lng: -106.3 },
  CH: { name: "Switzerland", lat: 46.8, lng: 8.2 },
  CL: { name: "Chile", lat: -35.7, lng: -71.5 },
  CN: { name: "China", lat: 35.9, lng: 104.2 },
  CO: { name: "Colombia", lat: 4.6, lng: -74.3 },
  CR: { name: "Costa Rica", lat: 9.7, lng: -83.8 },
  CU: { name: "Cuba", lat: 21.5, lng: -77.8 },
  CY: { name: "Cyprus", lat: 35.1, lng: 33.4 },
  CZ: { name: "Czechia", lat: 49.8, lng: 15.5 },
  DE: { name: "Germany", lat: 51.2, lng: 10.4 },
  DK: { name: "Denmark", lat: 56.3, lng: 9.5 },
  DO: { name: "Dominican Republic", lat: 18.7, lng: -70.2 },
  DZ: { name: "Algeria", lat: 28.0, lng: 1.7 },
  EC: { name: "Ecuador", lat: -1.8, lng: -78.2 },
  EE: { name: "Estonia", lat: 58.6, lng: 25.0 },
  EG: { name: "Egypt", lat: 26.8, lng: 30.8 },
  ES: { name: "Spain", lat: 40.5, lng: -3.7 },
  ET: { name: "Ethiopia", lat: 9.1, lng: 40.5 },
  FI: { name: "Finland", lat: 61.9, lng: 25.7 },
  FR: { name: "France", lat: 46.2, lng: 2.2 },
  GB: { name: "United Kingdom", lat: 55.4, lng: -3.4 },
  GR: { name: "Greece", lat: 39.1, lng: 21.8 },
  GT: { name: "Guatemala", lat: 15.8, lng: -90.2 },
  HK: { name: "Hong Kong", lat: 22.3, lng: 114.2 },
  HR: { name: "Croatia", lat: 45.1, lng: 15.2 },
  HU: { name: "Hungary", lat: 47.2, lng: 19.5 },
  ID: { name: "Indonesia", lat: -0.8, lng: 113.9 },
  IE: { name: "Ireland", lat: 53.4, lng: -8.2 },
  IL: { name: "Israel", lat: 31.0, lng: 34.9 },
  IN: { name: "India", lat: 20.6, lng: 78.9 },
  IR: { name: "Iran", lat: 32.4, lng: 53.7 },
  IS: { name: "Iceland", lat: 64.9, lng: -19.0 },
  IT: { name: "Italy", lat: 41.9, lng: 12.6 },
  JP: { name: "Japan", lat: 36.2, lng: 138.3 },
  KE: { name: "Kenya", lat: -0.0, lng: 37.9 },
  KR: { name: "South Korea", lat: 35.9, lng: 127.8 },
  KW: { name: "Kuwait", lat: 29.3, lng: 47.5 },
  LB: { name: "Lebanon", lat: 33.9, lng: 35.9 },
  LK: { name: "Sri Lanka", lat: 7.9, lng: 80.8 },
  LT: { name: "Lithuania", lat: 55.2, lng: 23.9 },
  LU: { name: "Luxembourg", lat: 49.8, lng: 6.1 },
  LV: { name: "Latvia", lat: 56.9, lng: 24.6 },
  MA: { name: "Morocco", lat: 31.8, lng: -7.1 },
  MX: { name: "Mexico", lat: 23.6, lng: -102.6 },
  MY: { name: "Malaysia", lat: 4.2, lng: 101.9 },
  NG: { name: "Nigeria", lat: 9.1, lng: 8.7 },
  NL: { name: "Netherlands", lat: 52.1, lng: 5.3 },
  NO: { name: "Norway", lat: 60.5, lng: 8.5 },
  NZ: { name: "New Zealand", lat: -40.9, lng: 174.9 },
  PA: { name: "Panama", lat: 8.5, lng: -80.8 },
  PE: { name: "Peru", lat: -9.2, lng: -75.0 },
  PH: { name: "Philippines", lat: 12.9, lng: 121.8 },
  PK: { name: "Pakistan", lat: 30.4, lng: 69.3 },
  PL: { name: "Poland", lat: 51.9, lng: 19.1 },
  PR: { name: "Puerto Rico", lat: 18.2, lng: -66.6 },
  PT: { name: "Portugal", lat: 39.4, lng: -8.2 },
  QA: { name: "Qatar", lat: 25.4, lng: 51.2 },
  RO: { name: "Romania", lat: 45.9, lng: 25.0 },
  RS: { name: "Serbia", lat: 44.0, lng: 21.0 },
  RU: { name: "Russia", lat: 61.5, lng: 105.3 },
  SA: { name: "Saudi Arabia", lat: 23.9, lng: 45.1 },
  SE: { name: "Sweden", lat: 60.1, lng: 18.6 },
  SG: { name: "Singapore", lat: 1.4, lng: 103.8 },
  SI: { name: "Slovenia", lat: 46.2, lng: 14.9 },
  SK: { name: "Slovakia", lat: 48.7, lng: 19.7 },
  TH: { name: "Thailand", lat: 15.9, lng: 100.9 },
  TN: { name: "Tunisia", lat: 33.9, lng: 9.5 },
  TR: { name: "Turkey", lat: 38.9, lng: 35.2 },
  TW: { name: "Taiwan", lat: 23.7, lng: 121.0 },
  UA: { name: "Ukraine", lat: 48.4, lng: 31.2 },
  US: { name: "United States", lat: 39.8, lng: -98.6 },
  UY: { name: "Uruguay", lat: -32.5, lng: -55.8 },
  VE: { name: "Venezuela", lat: 6.4, lng: -66.6 },
  VN: { name: "Vietnam", lat: 14.1, lng: 108.3 },
  ZA: { name: "South Africa", lat: -30.6, lng: 22.9 },
};

/** Look up a country centroid by ISO-2 code, case-insensitive. */
export function getCentroid(code: string | null | undefined): Centroid | null {
  if (!code) return null;
  return COUNTRY_CENTROIDS[code.toUpperCase()] ?? null;
}
