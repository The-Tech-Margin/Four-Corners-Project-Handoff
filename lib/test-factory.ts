/**
 * Schema-driven test data factory.
 *
 * Generates valid test metadata from Zod schemas, ensuring test data
 * always matches the canonical data model in field-registry.ts.
 *
 * Usage:
 *   import { createTestMetadata, createTestContextItem } from "@/lib/test-factory";
 *   const meta = createTestMetadata({ backStory: { text: "my story" } });
 *   const item = createTestContextItem({ caption: "test image" });
 */

import { randomUUID } from "crypto";
import {
  BackStorySchema,
  ContextItemSchema,
  LinkSchema,
  CreativeCommonsSchema,
  CodeOfEthicsSchema,
  PhotographerInfoSchema,
  LocationDataSchema,
  PhotoMetadataSchema,
  VoiceTranscriptionSchema,
  MetaSchema,
  FourCornersMetadataExtendedSchema,
  type FourCornersMetadataExtended,
  type ContextItem,
  type Link,
  type VoiceTranscription,
  type LocationData,
  type PhotoMetadata,
  type CodeOfEthics,
  type PhotographerInfo,
} from "./field-registry";

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_BACKSTORY = BackStorySchema.parse({});

const DEFAULT_CREATIVE_COMMONS = CreativeCommonsSchema.parse({});

const DEFAULT_ETHICS: CodeOfEthics = {
  customEthicsText: "",
  noManipulation: false,
  manipulationDetails: "",
  noStaging: false,
  stagingDetails: "",
  informedConsent: false,
  consentDetails: "",
  identityProtected: false,
  identityProtectionDetails: "",
  aiAltered: false,
  aiAlteredDetails: "",
};

const DEFAULT_PHOTOGRAPHER_INFO: PhotographerInfo = {
  bio: "",
  contact: "",
  website: "",
  collaborators: "",
};

const DEFAULT_META = MetaSchema.parse({
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  editorVersion: "test",
  mode: "complete",
});

// ── Factory functions ───────────────────────────────────────────────────────

/**
 * Create a valid ContextItem with sensible defaults.
 * All fields are validated against ContextItemSchema.
 */
export function createTestContextItem(
  overrides: Partial<ContextItem> = {},
): ContextItem {
  const base: ContextItem = {
    id: randomUUID(),
    sourceType: "upload",
    type: "image",
    caption: "",
    filename: "test-image.jpg",
    mimeType: "image/jpeg",
    ...overrides,
  };
  return ContextItemSchema.parse(base);
}

/**
 * Create a valid Link with sensible defaults.
 */
export function createTestLink(overrides: Partial<Link> = {}): Link {
  return LinkSchema.parse({
    title: "Test Link",
    url: "https://example.com",
    source: "Test Source",
    ...overrides,
  });
}

/**
 * Create a valid VoiceTranscription with sensible defaults.
 */
export function createTestTranscription(
  overrides: Partial<VoiceTranscription> = {},
): VoiceTranscription {
  return VoiceTranscriptionSchema.parse({
    id: randomUUID(),
    recordingId: randomUUID(),
    text: "Test transcription text",
    transcribedAt: new Date().toISOString(),
    ...overrides,
  });
}

/**
 * Create a valid LocationData object.
 */
export function createTestLocation(
  overrides: Partial<LocationData> = {},
): LocationData {
  return LocationDataSchema.parse({
    latitude: 40.7128,
    longitude: -74.006,
    city: "New York",
    state: "NY",
    country: "US",
    formattedLocation: "New York, NY, US",
    source: "manual",
    ...overrides,
  });
}

/**
 * Create a valid PhotoMetadata object with EXIF-like defaults.
 */
export function createTestPhotoMetadata(
  overrides: Partial<PhotoMetadata> = {},
): PhotoMetadata {
  return PhotoMetadataSchema.parse({
    dateTaken: "2026-01-15T10:30:00Z",
    equipment: {
      cameraMake: "Canon",
      cameraModel: "EOS R5",
      lensModel: "RF 24-70mm F2.8L",
      focalLength: "50mm",
      iso: "400",
      aperture: "f/2.8",
      shutterSpeed: "1/250s",
    },
    image: {
      width: 8192,
      height: 5464,
      orientation: 1,
    },
    device: {
      software: "Adobe Lightroom 9.0",
    },
    ...overrides,
  });
}

/** Override type: fields that are spread-merged accept partials; pass-through fields keep full types. */
type SpreadMergedKeys = "backStory" | "creativeCommons" | "ethics" | "photographerInfo";
type TestMetadataOverrides = {
  [K in SpreadMergedKeys]?: Partial<NonNullable<FourCornersMetadataExtended[K]>>;
} & {
  [K in Exclude<keyof FourCornersMetadataExtended, SpreadMergedKeys>]?: FourCornersMetadataExtended[K];
};

/**
 * Create a complete, valid FourCornersMetadataExtended object.
 * Deep-merges overrides with schema-validated defaults.
 *
 * Every test object created by this factory is validated against
 * the canonical Zod schema, so tests fail immediately if the
 * schema changes in an incompatible way.
 */
export function createTestMetadata(
  overrides: TestMetadataOverrides = {},
): FourCornersMetadataExtended {
  const base: FourCornersMetadataExtended = {
    backStory: { ...DEFAULT_BACKSTORY, ...overrides.backStory },
    context: overrides.context ?? [],
    links: overrides.links ?? [],
    creativeCommons: {
      ...DEFAULT_CREATIVE_COMMONS,
      ...overrides.creativeCommons,
    },
    ethics: overrides.ethics !== undefined
      ? { ...DEFAULT_ETHICS, ...overrides.ethics }
      : undefined,
    photographerInfo: overrides.photographerInfo !== undefined
      ? { ...DEFAULT_PHOTOGRAPHER_INFO, ...overrides.photographerInfo }
      : undefined,
    location: overrides.location,
    photoMetadata: overrides.photoMetadata,
    voiceTranscriptions: overrides.voiceTranscriptions,
    meta: overrides.meta ?? DEFAULT_META,
  };

  // Validate against the canonical schema — if this throws, the test data
  // doesn't match the schema and something needs updating.
  return FourCornersMetadataExtendedSchema.parse(base);
}

/**
 * Create a "rich" test metadata object with all sections populated.
 * Useful for testing views that render all fields.
 */
export function createTestMetadataFull(): FourCornersMetadataExtended {
  return createTestMetadata({
    backStory: {
      text: "A test photograph taken during field testing.",
      author: "Test Photographer",
      publication: "Test Publication",
      publicationUrl: "https://example.com/publication",
      date: "2026-01-15",
    },
    context: [
      createTestContextItem({
        caption: "Context image with caption",
        description: "Alt text for the context image",
        credit: "Photo by Test",
        date: "2026-01-14",
      }),
      createTestContextItem({
        caption: "Second context image",
        type: "video",
        filename: "test-video.mp4",
        mimeType: "video/mp4",
      }),
    ],
    links: [
      createTestLink({ title: "Related Article", url: "https://example.com/article" }),
      createTestLink({ title: "Source Material", url: "https://example.com/source" }),
    ],
    creativeCommons: {
      copyright: "Test Photographer 2026",
      description: "A test image for validation purposes.",
    },
    ethics: {
      ...DEFAULT_ETHICS,
      noManipulation: true,
      informedConsent: true,
      consentDetails: "Verbal consent obtained on location",
    },
    photographerInfo: {
      bio: "Test photographer bio",
      contact: "test@example.com",
      website: "https://example.com",
      collaborators: "Test Collaborator",
    },
    location: createTestLocation(),
    photoMetadata: createTestPhotoMetadata(),
    voiceTranscriptions: [
      createTestTranscription({ text: "This is a voice note about the photo" }),
    ],
  });
}
