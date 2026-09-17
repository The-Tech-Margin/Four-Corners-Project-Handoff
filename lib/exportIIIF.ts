/**
 * IIIF MANIFEST GENERATOR V2
 *
 * Registry-based IIIF export with automatic field mapping.
 * Performance optimized with indexed lookups and memoization.
 *
 * Benefits:
 * - Add field in registry → IIIF mapping auto-generated
 * - No manual buildMetadata() edits needed
 * - Guaranteed sync between Four Corners and IIIF schemas
 */

import type { FourCornersMetadataExtended } from "./field-registry";
import { FIELD_INDEX } from "./field-registry";
import {
  getValueByPath,
  hasFieldValue,
  transformValue,
  toIIIFLanguageMap,
} from "./field-utils";

// ============================================================================
// IIIF Types
// ============================================================================

interface IIIFMetadataItem {
  label: { en: string[] };
  value: { en: string[] };
}

interface IIIFProvider {
  id: string;
  type: string;
  label: { en: string[] };
  homepage?: Array<{
    id: string;
    type: string;
    format: string;
  }>;
}

interface IIIFManifest {
  "@context": string[];
  id: string;
  type: string;
  label: { en: string[] };
  summary?: { en: string[] };
  metadata: IIIFMetadataItem[];
  rights?: string;
  requiredStatement?: {
    label: { en: string[] };
    value: { en: string[] };
  };
  provider?: IIIFProvider[];
  homepage?: Array<{
    id: string;
    type: string;
    label: { en: string[] };
    format: string;
  }>;
  seeAlso?: Array<{
    id: string;
    type: string;
    label: { en: string[] };
    format: string;
    profile?: string;
  }>;
  navPlace?: {
    id: string;
    type: string;
    features: Array<{
      id: string;
      type: string;
      properties: {
        label: { en: string[] };
      };
      geometry: {
        type: string;
        coordinates: [number, number];
      };
    }>;
  };
  items: IIIFCanvas[];
}

interface IIIFCanvas {
  id: string;
  type: string;
  label: { en: string[] };
  width: number;
  height: number;
  items: Array<Record<string, unknown>>;
  annotations?: Array<Record<string, unknown>>;
}

// ============================================================================
// License Mapping
// ============================================================================

const LICENSE_MAP: Record<string, string> = {
  "© All Rights Reserved": "http://rightsstatements.org/vocab/InC/1.0/",
  "All Rights Reserved": "http://rightsstatements.org/vocab/InC/1.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC BY-NC 4.0": "https://creativecommons.org/licenses/by-nc/4.0/",
  "CC BY-ND 4.0": "https://creativecommons.org/licenses/by-nd/4.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC BY-NC-SA 4.0": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  "CC BY-NC-ND 4.0": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
  "Public Domain": "https://creativecommons.org/publicdomain/zero/1.0/",
};

function getLicenseUri(copyright?: string): string {
  if (!copyright) return "http://rightsstatements.org/vocab/CNE/1.0/";

  for (const [key, uri] of Object.entries(LICENSE_MAP)) {
    if (copyright.includes(key)) return uri;
  }

  return "http://rightsstatements.org/vocab/CNE/1.0/";
}

// ============================================================================
// Registry-Based Metadata Building (AUTO-GENERATED)
// ============================================================================

/**
 * Build metadata section from field registry
 * O(n) where n = number of fields with IIIF metadata mapping
 */
function buildMetadata(state: FourCornersMetadataExtended): IIIFMetadataItem[] {
  const metadata: IIIFMetadataItem[] = [];
  const fields = FIELD_INDEX.getByIIIFSection("metadata");

  for (const field of fields) {
    if (!field.iiif) continue;

    const value = getValueByPath(state, field.path);
    if (!hasFieldValue(state, field.path)) continue;

    // Apply transformation if defined
    const transformed = transformValue(value, field.iiif.transform, state);

    // Check condition if defined
    if (field.iiif.condition && !field.iiif.condition(value, state)) {
      continue;
    }

    metadata.push({
      label: toIIIFLanguageMap(field.iiif.label),
      value: toIIIFLanguageMap(
        Array.isArray(transformed) ? transformed : String(transformed)
      ),
    });
  }

  // Special case: Equipment metadata (composite field)
  const equipment = state.photoMetadata?.equipment;
  if (equipment) {
    const parts: string[] = [];
    if (equipment.cameraMake || equipment.cameraModel) {
      parts.push(
        `${equipment.cameraMake || ""} ${equipment.cameraModel || ""}`.trim()
      );
    }
    if (equipment.lensModel) parts.push(equipment.lensModel);
    if (equipment.focalLength) parts.push(equipment.focalLength);
    if (equipment.aperture) parts.push(equipment.aperture);
    if (equipment.shutterSpeed) parts.push(equipment.shutterSpeed);
    if (equipment.iso) parts.push(`ISO ${equipment.iso}`);

    if (parts.length > 0) {
      metadata.push({
        label: toIIIFLanguageMap("Equipment"),
        value: toIIIFLanguageMap(parts.join(", ")),
      });
    }
  }

  // Composite EXIF groups (device / GPS / capture time) — exported as one
  // metadata entry each, mirroring the Equipment composite above.
  const device = state.photoMetadata?.device;
  if (device) {
    const parts = [
      device.software,
      device.hostComputer,
      device.artist && `Artist: ${device.artist}`,
      device.copyright && `© ${device.copyright}`,
      device.imageDescription,
      device.userComment,
    ].filter(Boolean) as string[];
    if (parts.length > 0) {
      metadata.push({
        label: toIIIFLanguageMap("Processing"),
        value: toIIIFLanguageMap(parts.join(", ")),
      });
    }
  }

  const gps = state.photoMetadata?.gps;
  if (gps) {
    const parts = [
      gps.altitude != null && `altitude ${gps.altitude}${gps.altitudeRef ? ` (${gps.altitudeRef})` : ""}`,
      gps.speed != null && `speed ${gps.speed}${gps.speedRef ? ` ${gps.speedRef}` : ""}`,
      gps.imgDirection != null && `direction ${gps.imgDirection}${gps.imgDirectionRef ? ` ${gps.imgDirectionRef}` : ""}`,
      gps.destBearing != null && `bearing ${gps.destBearing}${gps.destBearingRef ? ` ${gps.destBearingRef}` : ""}`,
    ].filter(Boolean) as string[];
    if (parts.length > 0) {
      metadata.push({
        label: toIIIFLanguageMap("GPS"),
        value: toIIIFLanguageMap(parts.join(", ")),
      });
    }
  }

  const dateTaken =
    state.photoMetadata?.dateTaken ||
    state.photoMetadata?.temporal?.dateTimeOriginal;
  if (dateTaken) {
    metadata.push({
      label: toIIIFLanguageMap("Date Taken"),
      value: toIIIFLanguageMap(String(dateTaken)),
    });
  }

  return metadata;
}

/**
 * Build summary from field registry
 */
function buildSummary(
  state: FourCornersMetadataExtended
): { en: string[] } | undefined {
  const fields = FIELD_INDEX.getByIIIFSection("summary");

  for (const field of fields) {
    const value = getValueByPath(state, field.path);
    if (hasFieldValue(state, field.path)) {
      return toIIIFLanguageMap(String(value));
    }
  }

  return undefined;
}

/**
 * Build provider from field registry
 */
function buildProvider(
  state: FourCornersMetadataExtended,
  manifestId: string
): IIIFProvider[] | undefined {
  const author = state.backStory?.author;
  if (!author) return undefined;

  const provider: IIIFProvider = {
    id:
      state.backStory.publicationUrl ||
      state.photographerInfo?.website ||
      manifestId,
    type: "Agent",
    label: toIIIFLanguageMap(author),
  };

  const homepageUrl =
    state.photographerInfo?.website || state.backStory.publicationUrl;

  if (homepageUrl) {
    provider.homepage = [
      {
        id: homepageUrl,
        type: "Text",
        format: "text/html",
      },
    ];
  }

  return [provider];
}

/**
 * Build required statement (attribution)
 */
function buildRequiredStatement(state: FourCornersMetadataExtended):
  | {
      label: { en: string[] };
      value: { en: string[] };
    }
  | undefined {
  const copyright = state.creativeCommons?.copyright;
  if (!copyright) return undefined;

  return {
    label: toIIIFLanguageMap("Attribution"),
    value: toIIIFLanguageMap(copyright),
  };
}

/**
 * Build homepage from links
 */
function buildHomepage(state: FourCornersMetadataExtended):
  | Array<{
      id: string;
      type: string;
      label: { en: string[] };
      format: string;
    }>
  | undefined {
  if (!state.links || state.links.length === 0) return undefined;

  const firstLink = state.links[0];
  return [
    {
      id: firstLink.url,
      type: "Text",
      label: toIIIFLanguageMap(firstLink.title),
      format: "text/html",
    },
  ];
}

/**
 * Build navPlace from location data
 */
function buildNavPlace(
  state: FourCornersMetadataExtended,
  manifestId: string
): IIIFManifest["navPlace"] | undefined {
  const location = state.location;
  if (!location?.latitude || !location?.longitude) return undefined;

  const locationLabel =
    location.formattedLocation || `${location.latitude}, ${location.longitude}`;

  return {
    id: `${manifestId}/navPlace`,
    type: "FeatureCollection",
    features: [
      {
        id: `${manifestId}/navPlace/feature/1`,
        type: "Feature",
        properties: {
          label: toIIIFLanguageMap(locationLabel),
        },
        geometry: {
          type: "Point",
          coordinates: [location.longitude, location.latitude],
        },
      },
    ],
  };
}

// ============================================================================
// Canvas Building
// ============================================================================

function buildCanvas(
  imageFilename: string,
  caption: string,
  manifestId: string,
  canvasIndex: number,
  width?: number,
  height?: number
): IIIFCanvas {
  const canvasId = `${manifestId}/canvas/${canvasIndex}`;

  return {
    id: canvasId,
    type: "Canvas",
    label: toIIIFLanguageMap(caption),
    width: width || 1920,
    height: height || 1080,
    items: [
      {
        id: `${canvasId}/page/1`,
        type: "AnnotationPage",
        items: [
          {
            id: `${canvasId}/page/1/annotation/1`,
            type: "Annotation",
            motivation: "painting",
            body: {
              id: `./${imageFilename}`,
              type: "Image",
              format: "image/jpeg",
              width: width || 1920,
              height: height || 1080,
            },
            target: canvasId,
          },
        ],
      },
    ],
  };
}

// ============================================================================
// Main Export Function
// ============================================================================

export function generateIIIFManifest(
  state: FourCornersMetadataExtended,
  imageFilename: string,
  manifestId?: string
): IIIFManifest {
  const id = manifestId || `urn:uuid:${crypto.randomUUID()}`;
  const caption = state.creativeCommons?.description || imageFilename;

  // Build manifest using registry-based builders
  const manifest: IIIFManifest = {
    "@context": ["http://iiif.io/api/presentation/3/context.json"],
    id,
    type: "Manifest",
    label: toIIIFLanguageMap(caption),
    metadata: buildMetadata(state),
    items: [],
  };

  // Add optional sections
  const summary = buildSummary(state);
  if (summary) manifest.summary = summary;

  const rightsUri = getLicenseUri(state.creativeCommons?.copyright);
  if (rightsUri) manifest.rights = rightsUri;

  const requiredStatement = buildRequiredStatement(state);
  if (requiredStatement) manifest.requiredStatement = requiredStatement;

  const provider = buildProvider(state, id);
  if (provider) manifest.provider = provider;

  const homepage = buildHomepage(state);
  if (homepage) manifest.homepage = homepage;

  // Add seeAlso (Four Corners metadata reference)
  manifest.seeAlso = [
    {
      id: "./metadata.json",
      type: "Dataset",
      label: toIIIFLanguageMap("Four Corners Metadata"),
      format: "application/json",
      profile: "https://fourcornersproject.org/schema/1.0",
    },
  ];

  // Links beyond the first (which became homepage) — exported as seeAlso so
  // none of the user's links are silently dropped.
  if (state.links && state.links.length > 1) {
    for (const link of state.links.slice(1)) {
      if (!link.url) continue;
      manifest.seeAlso.push({
        id: link.url,
        type: "Text",
        label: toIIIFLanguageMap(link.title || link.url),
        format: "text/html",
      });
    }
  }

  // Add navPlace if location exists
  const navPlace = buildNavPlace(state, id);
  if (navPlace) {
    manifest["@context"].push(
      "http://iiif.io/api/extension/navplace/context.json"
    );
    manifest.navPlace = navPlace;
  }

  // Main canvas
  const mainCanvas = buildCanvas(imageFilename, caption, id, 1);

  // Add backstory + voice transcriptions as annotations
  const annotationItems: Array<Record<string, unknown>> = [];
  if (state.backStory?.text) {
    annotationItems.push({
      id: `${id}/canvas/1/annotations/1/annotation/1`,
      type: "Annotation",
      motivation: "commenting",
      body: {
        type: "TextualBody",
        value: state.backStory.text,
        format: "text/plain",
        language: "en",
      },
      target: `${id}/canvas/1`,
    });
  }

  // Voice note transcripts. Audio is referenced by relative path only
  // (security: never expose Supabase URLs in exports); duplicate texts
  // (e.g. a transcript already exported as the backstory) are skipped.
  const exportedTexts = new Set(
    state.backStory?.text ? [state.backStory.text.trim()] : [],
  );
  for (const vt of state.voiceTranscriptions || []) {
    const text = (vt.text || "").trim();
    if (!text || exportedTexts.has(text)) continue;
    exportedTexts.add(text);
    const audioFilename = vt.audioStoragePath
      ? `./audio/${vt.audioStoragePath.split("/").pop()}`
      : undefined;
    annotationItems.push({
      id: `${id}/canvas/1/annotations/1/annotation/${annotationItems.length + 1}`,
      type: "Annotation",
      motivation: "commenting",
      body: {
        type: "TextualBody",
        value: text,
        format: "text/plain",
        language: "en",
      },
      ...(audioFilename ? { rendering: [{ id: audioFilename, type: "Sound", format: vt.mimeType || "audio/webm" }] } : {}),
      target: `${id}/canvas/1`,
    });
  }

  if (annotationItems.length > 0) {
    mainCanvas.annotations = [
      {
        id: `${id}/canvas/1/annotations/1`,
        type: "AnnotationPage",
        items: annotationItems,
      },
    ];
  }

  manifest.items.push(mainCanvas);

  // Add related images as additional canvases
  if (state.context && state.context.length > 0) {
    state.context.forEach((contextItem, index) => {
      if (
        contextItem.type === "image" &&
        (contextItem.src || contextItem.url)
      ) {
        const relatedCanvas = buildCanvas(
          contextItem.src || contextItem.url || "",
          contextItem.caption || `Related image ${index + 1}`,
          id,
          index + 2
        );
        manifest.items.push(relatedCanvas);
      }
    });
  }

  return manifest;
}
