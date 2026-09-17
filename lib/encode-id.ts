/**
 * Encode and decode project IDs for sharing URLs
 * Uses base64url encoding to make IDs non-obvious while keeping them URL-safe
 * Works in both browser and Node.js environments
 */

/**
 * Encode a project ID for use in share URLs
 */
export function encodeProjectId(id: string): string {
  if (!id) return "";

  try {
    const base64 =
      typeof window !== "undefined"
        ? btoa(id)
        : Buffer.from(id).toString("base64");
    // Make URL-safe: replace +/ with -_ and strip padding
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (error) {
    console.error("Failed to encode project ID:", error);
    return id;
  }
}

/**
 * Decode a project ID from a share URL
 */
export function decodeProjectId(encodedId: string): string {
  if (!encodedId) return "";

  // Already a UUID — no decoding needed
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(encodedId)) {
    return encodedId;
  }

  // Reverse URL-safe encoding
  let base64 = encodedId.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4) {
    base64 += "=";
  }

  // Guard: only decode well-formed base64. Human-readable slugs (e.g.
  // `diptych-…-richmond-va`) are not valid base64 and would make `atob` throw —
  // previously caught, but it surfaced a noisy dev error overlay on every plain-
  // slug page load. Detecting the format first avoids exception-as-control-flow;
  // anything that isn't base64 is an opaque id (slug) and is returned untouched.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    return encodedId;
  }

  try {
    return typeof window !== "undefined"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    // Belt-and-suspenders: any residual decode failure falls back to the input.
    return encodedId;
  }
}
