/**
 * Per-browser persona (theme preset) preference. The picker writes it, the
 * PersonaProvider reads it; `?persona=<preset id>` overrides it for one visit.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export const PERSONA_STORAGE_KEY = "fc-theme-preset";

export function readStoredPersona(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(PERSONA_STORAGE_KEY);
  } catch {
    return null;
  }
}
