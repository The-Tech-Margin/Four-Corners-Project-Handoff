/**
 * Security utilities for sanitizing user input
 * Prevents XSS attacks in metadata fields
 */

import type { FourCornersMetadataExtended } from "@/lib/schema";

/**
 * Simple HTML sanitization without external dependencies
 * Removes script tags, event handlers, and dangerous attributes
 * For production use, consider installing isomorphic-dompurify
 */
function sanitizeHtml(input: string): string {
  if (!input) return input;

  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/on\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/<iframe/gi, "")
    .replace(/<object/gi, "")
    .replace(/<embed/gi, "");
}

/**
 * Sanitize text fields in metadata to prevent XSS
 * Recursively sanitizes all string values in nested objects
 */
function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return sanitizeHtml(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (obj && typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize metadata before storing in database
 * Focuses on user-provided text fields that will be rendered
 */
export function sanitizeMetadata(
  metadata: FourCornersMetadataExtended
): FourCornersMetadataExtended {
  const sanitized = { ...metadata };

  // Sanitize backStory fields
  if (sanitized.backStory?.text) {
    sanitized.backStory.text = sanitizeHtml(sanitized.backStory.text);
  }
  if (sanitized.backStory?.author) {
    sanitized.backStory.author = sanitizeHtml(sanitized.backStory.author);
  }
  if (sanitized.backStory?.publication) {
    sanitized.backStory.publication = sanitizeHtml(
      sanitized.backStory.publication
    );
  }

  // Sanitize creativeCommons fields
  if (sanitized.creativeCommons?.copyright) {
    sanitized.creativeCommons.copyright = sanitizeHtml(
      sanitized.creativeCommons.copyright
    );
  }
  if (sanitized.creativeCommons?.description) {
    sanitized.creativeCommons.description = sanitizeHtml(
      sanitized.creativeCommons.description
    );
  }

  // Sanitize ethics fields
  if (sanitized.ethics?.customEthicsText) {
    sanitized.ethics.customEthicsText = sanitizeHtml(
      sanitized.ethics.customEthicsText
    );
  }
  if (sanitized.ethics?.manipulationDetails) {
    sanitized.ethics.manipulationDetails = sanitizeHtml(
      sanitized.ethics.manipulationDetails
    );
  }
  if (sanitized.ethics?.stagingDetails) {
    sanitized.ethics.stagingDetails = sanitizeHtml(
      sanitized.ethics.stagingDetails
    );
  }
  if (sanitized.ethics?.consentDetails) {
    sanitized.ethics.consentDetails = sanitizeHtml(
      sanitized.ethics.consentDetails
    );
  }
  if (sanitized.ethics?.identityProtectionDetails) {
    sanitized.ethics.identityProtectionDetails = sanitizeHtml(
      sanitized.ethics.identityProtectionDetails
    );
  }

  // Sanitize photographer info
  if (sanitized.photographerInfo?.bio) {
    sanitized.photographerInfo.bio = sanitizeHtml(
      sanitized.photographerInfo.bio
    );
  }
  if (sanitized.photographerInfo?.contact) {
    sanitized.photographerInfo.contact = sanitizeHtml(
      sanitized.photographerInfo.contact
    );
  }
  if (sanitized.photographerInfo?.collaborators) {
    sanitized.photographerInfo.collaborators = sanitizeHtml(
      sanitized.photographerInfo.collaborators
    );
  }

  // Sanitize location fields
  if (sanitized.location?.city) {
    sanitized.location.city = sanitizeHtml(sanitized.location.city);
  }
  if (sanitized.location?.state) {
    sanitized.location.state = sanitizeHtml(sanitized.location.state);
  }
  if (sanitized.location?.country) {
    sanitized.location.country = sanitizeHtml(sanitized.location.country);
  }
  if (sanitized.location?.formattedLocation) {
    sanitized.location.formattedLocation = sanitizeHtml(
      sanitized.location.formattedLocation
    );
  }

  // Sanitize context items
  if (sanitized.context) {
    sanitized.context = sanitized.context.map((item) => ({
      ...item,
      caption: item.caption ? sanitizeHtml(item.caption) : item.caption,
      filename: item.filename ? sanitizeHtml(item.filename) : item.filename,
    }));
  }

  // Sanitize links
  if (sanitized.links) {
    sanitized.links = sanitized.links.map((link) => ({
      ...link,
      title: link.title ? sanitizeHtml(link.title) : link.title,
      source: link.source ? sanitizeHtml(link.source) : link.source,
    }));
  }

  return sanitized;
}

/**
 * Validate URL is safe (no javascript: or data: URIs)
 */
export function validateUrl(url: string): boolean {
  if (!url) return true;

  const lowerUrl = url.toLowerCase().trim();
  const dangerousProtocols = ["javascript:", "data:", "vbscript:", "file:"];

  return !dangerousProtocols.some((protocol) => lowerUrl.startsWith(protocol));
}

/**
 * Sanitize and validate metadata with comprehensive checks
 */
export function secureMetadata(
  metadata: FourCornersMetadataExtended
): FourCornersMetadataExtended {
  const sanitized = sanitizeMetadata(metadata);

  if (sanitized.links) {
    sanitized.links = sanitized.links.filter((link) => validateUrl(link.url));
  }

  if (sanitized.context) {
    sanitized.context = sanitized.context.filter((item) => {
      if (item.url && !validateUrl(item.url)) return false;
      if (item.src && !validateUrl(item.src)) return false;
      return true;
    });
  }

  return sanitized;
}
