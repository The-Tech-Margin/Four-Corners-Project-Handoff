/**
 * FIELD UTILITIES
 *
 * High-performance utilities for field access and manipulation
 * with memoization and type safety.
 */

// ============================================================================
// Path Access Utilities (Optimized)
// ============================================================================

const PATH_CACHE = new Map<string, string[]>();

function parsePath(path: string): string[] {
  if (!PATH_CACHE.has(path)) {
    PATH_CACHE.set(path, path.split("."));
  }
  return PATH_CACHE.get(path)!;
}

/**
 * Get nested value by dot notation path (O(n) where n = path depth)
 * Memoized path parsing for performance
 */
export function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  if (!obj) return undefined;

  const parts = parsePath(path);
  let value: unknown = obj;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

/**
 * Set nested value by dot notation path
 * Creates intermediate objects if needed
 */
export function setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  if (!obj) return;

  const parts = parsePath(path);
  const last = parts[parts.length - 1];
  let target: Record<string, unknown> = obj;

  // Navigate to parent object, creating intermediate objects
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!target[part] || typeof target[part] !== "object") {
      target[part] = {};
    }
    target = target[part] as Record<string, unknown>;
  }

  target[last] = value;
}

/**
 * Delete nested value by dot notation path
 */
export function deleteValueByPath(obj: Record<string, unknown>, path: string): void {
  if (!obj) return;

  const parts = parsePath(path);
  const last = parts[parts.length - 1];
  let target: Record<string, unknown> = obj;

  // Navigate to parent object
  for (let i = 0; i < parts.length - 1; i++) {
    if (!target[parts[i]]) return;
    target = target[parts[i]] as Record<string, unknown>;
  }

  delete target[last];
}

/**
 * Check if value exists and is not empty
 */
export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === "object" && Object.keys(value).length === 0)
    return false;
  return true;
}

/**
 * Check if field has value in object
 */
export function hasFieldValue(obj: Record<string, unknown>, path: string): boolean {
  const value = getValueByPath(obj, path);
  return hasValue(value);
}

// ============================================================================
// Type Guards
// ============================================================================

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ============================================================================
// Value Transformation Utilities
// ============================================================================

/**
 * Transform value with optional transformer function
 * Handles null/undefined gracefully
 */
export function transformValue<T, R, C = unknown>(
  value: T,
  transformer?: (val: T, context?: C) => R,
  context?: C
): R | T {
  if (!hasValue(value)) return value;
  if (!transformer) return value;

  try {
    return transformer(value, context);
  } catch (error) {
    console.warn("Value transformation failed:", error);
    return value;
  }
}

/**
 * Convert value to IIIF language map format
 */
export function toIIIFLanguageMap(
  value: string | string[],
  language = "en"
): { en: string[] } {
  const values = Array.isArray(value) ? value : [value];
  return { en: values.filter(hasValue) };
}

/**
 * Strip empty/null/undefined values from an object tree.
 * Removes empty strings, empty arrays, and empty nested objects.
 * NOT a security sanitizer — for XSS prevention see lib/security/sanitize.ts.
 */
export function stripEmptyValues<T extends object>(obj: T): T {
  const result = {} as T;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      if (isObject(value)) {
        const stripped = stripEmptyValues(value);
        if (Object.keys(stripped).length > 0) {
          result[key] = stripped;
        }
      } else if (isArray(value)) {
        const filtered = value.filter(hasValue);
        if (filtered.length > 0) {
          result[key] = filtered as T[Extract<keyof T, string>];
        }
      } else if (hasValue(value)) {
        result[key] = value;
      }
    }
  }

  return result;
}

