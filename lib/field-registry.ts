import { z } from "zod";

/**
 * COMPREHENSIVE FIELD REGISTRY
 *
 * Single source of truth for all metadata fields.
 * Performance optimized with:
 * - Zod schema validation (runtime + compile-time types)
 * - Indexed lookups (O(1) access)
 * - Memoized transformations
 * - Type inference from schema
 */

// ============================================================================
// Zod Schemas - Single Source of Truth
// ============================================================================

export const BackStorySchema = z.object({
  text: z
    .string()
    .optional()
    .default("")
    .describe("Photographer's narrative about the image"),
  author: z.string().optional().default("").describe("Photographer name"),
  publication: z
    .string()
    .optional()
    .default("")
    .describe("Organization or publication name"),
  publicationUrl: z
    .string()
    .optional()
    .default("")
    .describe("Organization URL"),
  date: z
    .string()
    .optional()
    .default("")
    .describe("Date of capture (ISO format)"),
});

export const ContextItemSchema = z.object({
  id: z.string(),
  sourceType: z.enum(["upload", "url"]),
  blobId: z.number().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  thumbnailDataUrl: z.string().optional(),
  storage_path: z.string().optional(), // Supabase Storage path for full-size image
  storage_url: z.string().optional(), // Public URL for full-size image
  thumbnail_storage_path: z.string().optional(), // Supabase Storage path for thumbnail
  thumbnail_storage_url: z.string().optional(), // Public URL for thumbnail
  url: z.string().optional(),
  src: z.string().optional(),
  caption: z.string().optional().default(""),
  type: z.enum(["image", "video"]),
  description: z.string().optional(),
  credit: z.string().optional(),
  date: z.string().optional(),
  audioStoragePath: z.string().optional(),
  audioStorageUrl: z.string().optional(),
  audioDataUrl: z.string().optional(),
  // Numeric ID into the mediaStorage IDB (lib/media-storage.ts) holding the
  // raw audio Blob until the Supabase upload succeeds — same crash-recovery
  // semantics as VoiceTranscriptionSchema.audioBlobId. Cleared after upload.
  audioBlobId: z.number().optional(),
  audioMimeType: z.string().optional(),
  audioDuration: z.number().optional(),
  linkedProjectId: z.string().optional(),
  linkedProjectSlug: z.string().optional(),
});

export const LinkSchema = z.object({
  title: z.string().optional().default("").describe("Display title"),
  url: z
    .string()
    .optional()
    .default("")
    .describe("URL of resource"),
  source: z.string().optional().default("").describe("Source/publication name"),
});

export const CreativeCommonsSchema = z.object({
  copyright: z.string().default("").describe("Copyright statement"),
  description: z
    .string()
    .default("")
    .describe("Caption/description for publication"),
});

export const CodeOfEthicsSchema = z.object({
  customEthicsText: z.string().optional(),
  noManipulation: z.boolean(),
  manipulationDetails: z.string().optional(),
  noStaging: z.boolean(),
  stagingDetails: z.string().optional(),
  informedConsent: z.boolean(),
  consentDetails: z.string().optional(),
  identityProtected: z.boolean(),
  identityProtectionDetails: z.string().optional(),
  consentDocumentUrl: z.string().optional(),
  aiAltered: z.boolean().optional(),
  aiAlteredDetails: z.string().optional(),
});

export const PhotographerInfoSchema = z.object({
  bio: z.string().optional(),
  contact: z.string().optional(),
  website: z.string().optional(),
  collaborators: z.string().optional(),
});

/** Coerce any non-scalar (Buffer, Uint8Array, array, object) to null. Keeps
 *  numbers and strings as-is. Used to harden GPS scalar fields against
 *  exifr returning raw byte buffers. */
const gpsScalar = () =>
  z.preprocess(
    (v) => {
      if (v == null) return null;
      if (typeof v === "number" || typeof v === "string") return v;
      // Buffer / Uint8Array — take first byte if present
      if (typeof v === "object") {
        const o = v as { [k: number]: unknown; length?: number };
        if (typeof o.length === "number" && o.length > 0 && typeof o[0] === "number") {
          return o[0];
        }
      }
      return null;
    },
    z.union([z.number(), z.string()]).nullable(),
  ).optional();

export const LocationDataSchema = z.object({
  // Empty is allowed — new projects may not have any GPS data. Non-number
  // inputs (e.g. raw DMS arrays from exifr) are coerced to null via preprocess
  // so a stale/malformed EXIF read doesn't block save.
  latitude: z.preprocess(
    (v) => (typeof v === "number" && Number.isFinite(v) ? v : null),
    z.number().nullable(),
  ).optional(),
  longitude: z.preprocess(
    (v) => (typeof v === "number" && Number.isFinite(v) ? v : null),
    z.number().nullable(),
  ).optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  formattedLocation: z.string().nullable().optional(),
  capturedAt: z.string().optional(),
  source: z.enum(["exif", "device", "manual", "voicevault"]).optional(),
  address: z.object({
    street: z.string().optional(),
    street2: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    stateProvince: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});

export const PhotoMetadataSchema = z.object({
  dateTaken: z.string().nullable().optional(),
  temporal: z
    .object({
      dateTimeOriginal: z.string().nullable().optional(),
      dateTime: z.string().nullable().optional(),
      dateTimeDigitized: z.string().nullable().optional(),
      dateModified: z.string().nullable().optional(),
      offsetTimeOriginal: z.string().nullable().optional(),
      offsetTime: z.string().nullable().optional(),
      offsetTimeDigitized: z.string().nullable().optional(),
      subSecTimeOriginal: z.string().nullable().optional(),
      subSecTime: z.string().nullable().optional(),
      subSecTimeDigitized: z.string().nullable().optional(),
      gpsDateStamp: z.string().nullable().optional(),
      gpsTimeStamp: z.string().nullable().optional(),
    })
    .optional(),
  gps: z
    .object({
      // exifr can return raw Buffer/Uint8Array for these fields depending on
      // version. Preprocess coerces anything that's not a plain number/string
      // to null rather than blocking save.
      altitude: gpsScalar(),
      altitudeRef: gpsScalar(),
      speed: gpsScalar(),
      speedRef: gpsScalar(),
      imgDirection: gpsScalar(),
      imgDirectionRef: gpsScalar(),
      destBearing: gpsScalar(),
      destBearingRef: gpsScalar(),
    })
    .optional(),
  equipment: z
    .object({
      cameraMake: z.string().nullable().optional(),
      cameraModel: z.string().nullable().optional(),
      lensModel: z.string().nullable().optional(),
      focalLength: z.string().nullable().optional(),
      iso: z.union([z.number(), z.string()]).nullable().optional(),
      aperture: z.string().nullable().optional(),
      shutterSpeed: z.string().nullable().optional(),
    })
    .optional(),
  device: z
    .object({
      software: z.string().nullable().optional(),
      hostComputer: z.string().nullable().optional(),
      artist: z.string().nullable().optional(),
      copyright: z.string().nullable().optional(),
      userComment: z.string().nullable().optional(),
      imageDescription: z.string().nullable().optional(),
    })
    .optional(),
  image: z
    .object({
      width: z.union([z.number(), z.string()]).nullable().optional(),
      height: z.union([z.number(), z.string()]).nullable().optional(),
      orientation: z.union([z.number(), z.string()]).nullable().optional(),
    })
    .optional(),
});

export const VoiceTranscriptionSchema = z.object({
  id: z.string(),
  recordingId: z.string(),
  text: z.string(),
  transcribedAt: z.string(),
  fieldId: z.string().optional(),
  audioDataUrl: z.string().optional(),
  audioStoragePath: z.string().optional(),
  audioStorageUrl: z.string().optional(),
  // Numeric ID into the mediaStorage IDB (lib/media-storage.ts) where the
  // raw audio Blob lives until the upload to Supabase succeeds. Survives
  // mobile tab-discard / refresh: when the page reloads with a transcription
  // that has audioBlobId but no audioStorageUrl, the upload helper recovers
  // the Blob from mediaStorage and uploads it. Cleared after upload.
  audioBlobId: z.number().optional(),
  mimeType: z.string().optional(),
  duration: z.number().optional(),
});

export const MetaSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  editorVersion: z.string(),
  mode: z.enum(["minimal", "standard", "complete"]),
});

// ============================================================================
// UserAsset — a single entry in the per-user cross-project asset library.
// Mirrors the user_assets table (migration 036). Every new upload records one.
// ============================================================================
export const UserAssetSchema = z.object({
  id: z.string(),
  userId: z.string(),
  mediaType: z.enum(["image", "video", "audio", "document"]),
  mimeType: z.string(),
  fileName: z.string(),
  storageBucket: z.string(),
  storagePath: z.string(),
  storageUrl: z.string(),
  thumbnailStoragePath: z.string().nullable().optional(),
  thumbnailStorageUrl: z.string().nullable().optional(),
  fileSize: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  createdAt: z.string(),
});

// Complete metadata schema
export const FourCornersMetadataExtendedSchema = z.object({
  backStory: BackStorySchema,
  context: z.array(ContextItemSchema),
  links: z.array(LinkSchema),
  creativeCommons: CreativeCommonsSchema,
  ethics: CodeOfEthicsSchema.optional(),
  photographerInfo: PhotographerInfoSchema.optional(),
  location: LocationDataSchema.optional(),
  photoMetadata: PhotoMetadataSchema.optional(),
  voiceTranscriptions: z.array(VoiceTranscriptionSchema).optional(),
  meta: MetaSchema.optional(),
});

// Infer TypeScript types from Zod schemas
export type FourCornersMetadataExtended = z.infer<
  typeof FourCornersMetadataExtendedSchema
>;
export type BackStory = z.infer<typeof BackStorySchema>;
export type ContextItem = z.infer<typeof ContextItemSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type CreativeCommons = z.infer<typeof CreativeCommonsSchema>;
export type CodeOfEthics = z.infer<typeof CodeOfEthicsSchema>;
export type PhotographerInfo = z.infer<typeof PhotographerInfoSchema>;
export type LocationData = z.infer<typeof LocationDataSchema>;
export type PhotoMetadata = z.infer<typeof PhotoMetadataSchema>;
export type VoiceTranscription = z.infer<typeof VoiceTranscriptionSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type UserAsset = z.infer<typeof UserAssetSchema>;
export type UserAssetMediaType = UserAsset["mediaType"];

// ============================================================================
// Field Definitions for IIIF & Four Corners Mapping
// ============================================================================

export interface IIIFMapping {
  label: string;
  section:
    | "metadata"
    | "summary"
    | "provider"
    | "requiredStatement"
    | "navPlace"
    | "rights"
    | "homepage"
    | "seeAlso";
  transform?: (value: unknown, state?: FourCornersMetadataExtended) => unknown;
  condition?: (value: unknown, state?: FourCornersMetadataExtended) => boolean;
}

export interface FieldDefinition {
  path: string;
  label: string;
  fourCornersPath: string;
  iiif?: IIIFMapping;
  uiSection?: string;
  required?: boolean;
  /** Which canvas corner renders this field (null/omitted = not on canvas) */
  canvasCorner?: "backstory" | "cc" | null;
  /** "text" (default) = editable text-block; "boolean" = read-only summary flag */
  fieldType?: "text" | "boolean";
  /** Conversational placeholder shown on canvas text-blocks */
  canvasPlaceholder?: string;
}

export const FIELD_REGISTRY: Record<string, FieldDefinition> = {
  // BackStory Fields
  "backStory.text": {
    path: "backStory.text",
    label: "Backstory",
    fourCornersPath: "backStory.text",
    iiif: {
      label: "Backstory",
      section: "summary",
    },
    uiSection: "backstory",
    canvasCorner: "backstory",
    canvasPlaceholder: "What\u2019s the story behind this image?",
  },
  "backStory.author": {
    path: "backStory.author",
    label: "Photographer Name",
    fourCornersPath: "backStory.author",
    iiif: {
      label: "Creator",
      section: "metadata",
    },
    uiSection: "backstory",
    required: true,
    canvasCorner: "backstory",
    canvasPlaceholder: "Who made this photograph?",
  },
  "backStory.publication": {
    path: "backStory.publication",
    label: "Publication",
    fourCornersPath: "backStory.publication",
    iiif: {
      label: "Publisher",
      section: "metadata",
    },
    uiSection: "backstory",
    canvasCorner: "backstory",
    canvasPlaceholder: "Where was this published?",
  },
  "backStory.publicationUrl": {
    path: "backStory.publicationUrl",
    label: "Publication URL",
    fourCornersPath: "backStory.publicationUrl",
    iiif: {
      label: "Publisher URL",
      section: "provider",
    },
    uiSection: "backstory",
    canvasCorner: "backstory",
    canvasPlaceholder: "Link to the publication...",
  },
  "backStory.date": {
    path: "backStory.date",
    label: "Date",
    fourCornersPath: "backStory.date",
    iiif: {
      label: "Date",
      section: "metadata",
    },
    uiSection: "backstory",
    canvasCorner: "backstory",
    canvasPlaceholder: "When was this taken?",
  },

  // Creative Commons Fields
  "creativeCommons.copyright": {
    path: "creativeCommons.copyright",
    label: "Copyright",
    fourCornersPath: "creativeCommons.copyright",
    iiif: {
      label: "Attribution",
      section: "requiredStatement",
    },
    uiSection: "caption-credit-ethics",
    required: true,
    canvasCorner: "cc",
    canvasPlaceholder: "Who holds the copyright?",
  },
  "creativeCommons.description": {
    path: "creativeCommons.description",
    label: "Caption/Description",
    fourCornersPath: "creativeCommons.description",
    iiif: {
      label: "Caption",
      section: "metadata",
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    canvasPlaceholder: "Describe what the viewer sees...",
  },

  // Ethics Fields
  "ethics.noManipulation": {
    path: "ethics.noManipulation",
    label: "No Manipulation",
    fourCornersPath: "ethics.noManipulation",
    iiif: {
      label: "Ethics - Manipulation",
      section: "metadata",
      transform: (val) =>
        val
          ? "No manipulation beyond standard processing"
          : "May contain edits",
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    fieldType: "boolean",
  },
  "ethics.manipulationDetails": {
    path: "ethics.manipulationDetails",
    label: "Manipulation Details",
    fourCornersPath: "ethics.manipulationDetails",
    iiif: {
      label: "Ethics - Manipulation Details",
      section: "metadata",
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    canvasPlaceholder: "Describe any manipulation...",
  },
  "ethics.noStaging": {
    path: "ethics.noStaging",
    label: "No Staging",
    fourCornersPath: "ethics.noStaging",
    iiif: {
      label: "Ethics - Staging",
      section: "metadata",
      transform: (val) => (val ? "Not staged" : "May be staged"),
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    fieldType: "boolean",
  },
  "ethics.stagingDetails": {
    path: "ethics.stagingDetails",
    label: "Staging Details",
    fourCornersPath: "ethics.stagingDetails",
    iiif: {
      label: "Ethics - Staging Details",
      section: "metadata",
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    canvasPlaceholder: "Describe any staging...",
  },
  "ethics.informedConsent": {
    path: "ethics.informedConsent",
    label: "Informed Consent",
    fourCornersPath: "ethics.informedConsent",
    iiif: {
      label: "Ethics - Consent",
      section: "metadata",
      transform: (val) => (val ? "Consent obtained" : "Consent status unknown"),
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    fieldType: "boolean",
  },
  "ethics.consentDetails": {
    path: "ethics.consentDetails",
    label: "Consent Details",
    fourCornersPath: "ethics.consentDetails",
    iiif: {
      label: "Ethics - Consent Details",
      section: "metadata",
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    canvasPlaceholder: "Type of consent obtained...",
  },
  "ethics.identityProtected": {
    path: "ethics.identityProtected",
    label: "Identity Protected",
    fourCornersPath: "ethics.identityProtected",
    iiif: {
      label: "Ethics - Identity Protection",
      section: "metadata",
      transform: (val) =>
        val ? "Identity protected" : "No identity protection",
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    fieldType: "boolean",
  },
  "ethics.identityProtectionDetails": {
    path: "ethics.identityProtectionDetails",
    label: "Identity Protection Details",
    fourCornersPath: "ethics.identityProtectionDetails",
    iiif: {
      label: "Ethics - Identity Protection Details",
      section: "metadata",
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    canvasPlaceholder: "Identity protection method...",
  },
  "ethics.aiAltered": {
    path: "ethics.aiAltered",
    label: "AI Altered",
    fourCornersPath: "ethics.aiAltered",
    iiif: {
      label: "Ethics - AI Alteration",
      section: "metadata",
      transform: (val) => (val ? "AI altered" : "Not AI altered"),
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    fieldType: "boolean",
  },
  "ethics.aiAlteredDetails": {
    path: "ethics.aiAlteredDetails",
    label: "AI Alteration Details",
    fourCornersPath: "ethics.aiAlteredDetails",
    iiif: {
      label: "Ethics - AI Alteration Details",
      section: "metadata",
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    canvasPlaceholder: "Describe AI alterations...",
  },
  "ethics.customEthicsText": {
    path: "ethics.customEthicsText",
    label: "Custom Ethics Statement",
    fourCornersPath: "ethics.customEthicsText",
    iiif: {
      label: "Ethics Statement",
      section: "metadata",
    },
    uiSection: "caption-credit-ethics",
    canvasCorner: "cc",
    canvasPlaceholder: "Any ethical considerations?",
  },

  // Photographer Info Fields
  "photographerInfo.bio": {
    path: "photographerInfo.bio",
    label: "Photographer Bio",
    fourCornersPath: "photographerInfo.bio",
    iiif: {
      label: "Photographer Bio",
      section: "metadata",
    },
    uiSection: "backstory",
    canvasCorner: "cc",
    canvasPlaceholder: "Tell us about yourself...",
  },
  "photographerInfo.contact": {
    path: "photographerInfo.contact",
    label: "Contact",
    fourCornersPath: "photographerInfo.contact",
    iiif: {
      label: "Contact",
      section: "metadata",
    },
    uiSection: "backstory",
    canvasCorner: "cc",
    canvasPlaceholder: "How to reach you...",
  },
  "photographerInfo.website": {
    path: "photographerInfo.website",
    label: "Website",
    fourCornersPath: "photographerInfo.website",
    iiif: {
      label: "Photographer Website",
      section: "homepage",
    },
    uiSection: "backstory",
    canvasCorner: "cc",
    canvasPlaceholder: "Your website...",
  },
  "photographerInfo.collaborators": {
    path: "photographerInfo.collaborators",
    label: "Collaborators",
    fourCornersPath: "photographerInfo.collaborators",
    iiif: {
      label: "Collaborators",
      section: "metadata",
    },
    uiSection: "backstory",
    canvasCorner: "cc",
    canvasPlaceholder: "Contributors or collaborators...",
  },

  // Location Fields
  "location.latitude": {
    path: "location.latitude",
    label: "Latitude",
    fourCornersPath: "location.latitude",
    iiif: {
      label: "Location",
      section: "navPlace",
    },
    uiSection: "location",
  },
  "location.longitude": {
    path: "location.longitude",
    label: "Longitude",
    fourCornersPath: "location.longitude",
    iiif: {
      label: "Location",
      section: "navPlace",
    },
    uiSection: "location",
  },
  "location.formattedLocation": {
    path: "location.formattedLocation",
    label: "Location",
    fourCornersPath: "location.formattedLocation",
    iiif: {
      label: "Location",
      section: "metadata",
    },
    uiSection: "location",
  },

  // Photo Metadata - Equipment
  "photoMetadata.equipment.cameraMake": {
    path: "photoMetadata.equipment.cameraMake",
    label: "Camera Make",
    fourCornersPath: "photoMetadata.equipment.cameraMake",
    uiSection: "camera-metadata",
  },
  "photoMetadata.equipment.cameraModel": {
    path: "photoMetadata.equipment.cameraModel",
    label: "Camera Model",
    fourCornersPath: "photoMetadata.equipment.cameraModel",
    uiSection: "camera-metadata",
  },
  "photoMetadata.equipment.lensModel": {
    path: "photoMetadata.equipment.lensModel",
    label: "Lens",
    fourCornersPath: "photoMetadata.equipment.lensModel",
    uiSection: "camera-metadata",
  },
  "photoMetadata.equipment.focalLength": {
    path: "photoMetadata.equipment.focalLength",
    label: "Focal Length",
    fourCornersPath: "photoMetadata.equipment.focalLength",
    uiSection: "camera-metadata",
  },
  "photoMetadata.equipment.iso": {
    path: "photoMetadata.equipment.iso",
    label: "ISO",
    fourCornersPath: "photoMetadata.equipment.iso",
    uiSection: "camera-metadata",
  },
  "photoMetadata.equipment.aperture": {
    path: "photoMetadata.equipment.aperture",
    label: "Aperture",
    fourCornersPath: "photoMetadata.equipment.aperture",
    uiSection: "camera-metadata",
  },
  "photoMetadata.equipment.shutterSpeed": {
    path: "photoMetadata.equipment.shutterSpeed",
    label: "Shutter Speed",
    fourCornersPath: "photoMetadata.equipment.shutterSpeed",
    uiSection: "camera-metadata",
  },
};

// ============================================================================
// Performance Optimizations - Indexed Lookups
// ============================================================================

class FieldRegistryIndex {
  private byPath: Map<string, FieldDefinition>;
  private bySection: Map<string, FieldDefinition[]>;
  private byIIIFSection: Map<string, FieldDefinition[]>;
  private byCanvasCorner: Map<string, FieldDefinition[]>;
  private withIIIFMapping: FieldDefinition[];

  constructor(registry: Record<string, FieldDefinition>) {
    this.byPath = new Map();
    this.bySection = new Map();
    this.byIIIFSection = new Map();
    this.byCanvasCorner = new Map();
    this.withIIIFMapping = [];

    // Build indexes
    for (const field of Object.values(registry)) {
      // Index by path (O(1) lookup)
      this.byPath.set(field.path, field);

      // Index by UI section
      if (field.uiSection) {
        if (!this.bySection.has(field.uiSection)) {
          this.bySection.set(field.uiSection, []);
        }
        this.bySection.get(field.uiSection)!.push(field);
      }

      // Index by IIIF section
      if (field.iiif) {
        this.withIIIFMapping.push(field);
        if (!this.byIIIFSection.has(field.iiif.section)) {
          this.byIIIFSection.set(field.iiif.section, []);
        }
        this.byIIIFSection.get(field.iiif.section)!.push(field);
      }

      // Index by canvas corner
      if (field.canvasCorner) {
        if (!this.byCanvasCorner.has(field.canvasCorner)) {
          this.byCanvasCorner.set(field.canvasCorner, []);
        }
        this.byCanvasCorner.get(field.canvasCorner)!.push(field);
      }
    }
  }

  getByPath(path: string): FieldDefinition | undefined {
    return this.byPath.get(path);
  }

  getBySection(section: string): FieldDefinition[] {
    return this.bySection.get(section) || [];
  }

  getByIIIFSection(section: string): FieldDefinition[] {
    return this.byIIIFSection.get(section) || [];
  }

  getAllWithIIIF(): FieldDefinition[] {
    return this.withIIIFMapping;
  }

  /** All fields (text + boolean) for a canvas corner */
  getByCanvasCorner(corner: "backstory" | "cc"): FieldDefinition[] {
    return this.byCanvasCorner.get(corner) || [];
  }

  /** Only text fields for a canvas corner (editable text-block shapes) */
  getCanvasTextFields(corner: "backstory" | "cc"): FieldDefinition[] {
    return (this.byCanvasCorner.get(corner) || []).filter(
      (f) => f.fieldType !== "boolean",
    );
  }
}

// Singleton index instance (memoized)
export const FIELD_INDEX = new FieldRegistryIndex(FIELD_REGISTRY);
