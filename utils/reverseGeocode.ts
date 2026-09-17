interface GeocodedLocation {
  city: string | null;
  state: string | null;
  country: string | null;
  formattedLocation: string | null;
}

const CACHE_KEY = "geocode_cache";

function getCacheKey(lat: number, lon: number): string {
  // Round to ~1km precision for cache hits on nearby coords
  if (
    typeof lat !== "number" ||
    isNaN(lat) ||
    typeof lon !== "number" ||
    isNaN(lon)
  ) {
    return "0,0";
  }
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function getCache(): Record<string, GeocodedLocation> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setCache(key: string, value: GeocodedLocation) {
  const cache = getCache();
  cache[key] = value;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<GeocodedLocation> {
  const cacheKey = getCacheKey(lat, lon);
  const cached = getCache()[cacheKey];
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { "User-Agent": "FourCornersMetadataEditor/1.0" } }
    );

    if (!response.ok) throw new Error("Geocode failed");

    const data = await response.json();
    const addr = data.address || {};

    const result: GeocodedLocation = {
      city: addr.city || addr.town || addr.village || null,
      state: addr.state || addr.region || null,
      country: addr.country || null,
      formattedLocation:
        [addr.city || addr.town || addr.village, addr.state, addr.country]
          .filter(Boolean)
          .join(", ") || null,
    };

    setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.warn("Reverse geocode failed:", e);
    return {
      city: null,
      state: null,
      country: null,
      formattedLocation: null,
    };
  }
}

export type { GeocodedLocation };
