/**
 * Export → import round-trip: the executable 1:1 contract (Layer A).
 *
 * A full-fat project serialized by toFourCornersSchema and re-imported by
 * parseMetadataText must be value-identical after canonicalizeForComparison.
 * This is the acceptance gate for import field fidelity — it fails against
 * the old hand-listed context remap.
 */

import { describe, it, expect } from "vitest";
import { toFourCornersSchema } from "@/lib/schema";
import { parseMetadataText } from "@/lib/importMetadata";
import {
  canonicalizeForComparison,
  CURRENT_EXPORT_VERSION,
} from "@/lib/export-contract";
import type {
  ContextItem,
  FourCornersMetadataExtended,
  VoiceTranscription,
} from "@/lib/field-registry";

// ── Local fixtures ──────────────────────────────────────────────────────────

function fixtureContextItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: "ctx-upload",
    sourceType: "upload",
    type: "image",
    caption: "uploaded photo",
    description: "alt text for the photo",
    credit: "Photo by Fixture",
    date: "2026-01-14",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    src: "data:image/jpeg;base64,/9j/AAA=",
    blobId: 7,
    thumbnailDataUrl: "data:image/jpeg;base64,thumb",
    storage_path: "user-1/context-images/proj-1/photo.jpg",
    storage_url:
      "https://abc.supabase.co/storage/v1/object/public/context-media/photo.jpg",
    thumbnail_storage_path: "user-1/context-images/proj-1/thumbs/photo.jpg",
    thumbnail_storage_url:
      "https://abc.supabase.co/storage/v1/object/public/context-media/thumbs/photo.jpg",
    audioDataUrl: "data:audio/webm;base64,audio",
    audioBlobId: 11,
    audioStoragePath: "user-1/context-audio/proj-1/ctx-upload.webm",
    audioStorageUrl:
      "https://abc.supabase.co/storage/v1/object/public/context-media/ctx-upload.webm",
    audioMimeType: "audio/webm",
    audioDuration: 8.25,
    ...overrides,
  };
}

function fixtureVoice(
  overrides: Partial<VoiceTranscription> = {},
): VoiceTranscription {
  return {
    id: "vt-1",
    recordingId: "rec-1",
    text: "a voice note about the photo",
    transcribedAt: "2026-01-15T09:00:00.000Z",
    fieldId: "backstory",
    audioDataUrl: "data:audio/webm;base64,voice",
    audioBlobId: 13,
    audioStoragePath: "user-1/voice-recordings/proj-1/rec-1.webm",
    audioStorageUrl:
      "https://abc.supabase.co/storage/v1/object/sign/voice-recordings/rec-1.webm",
    mimeType: "audio/webm",
    duration: 4.5,
    ...overrides,
  };
}

function fixtureMetadata(): FourCornersMetadataExtended {
  return {
    backStory: {
      text: "The story behind the photograph.",
      author: "Fixture Photographer",
      publication: "Fixture Publication",
      publicationUrl: "https://example.com/pub",
      date: "2026-01-15",
    },
    context: [
      fixtureContextItem(),
      fixtureContextItem({
        id: "ctx-external",
        sourceType: "url",
        type: "video",
        caption: "external video",
        filename: undefined,
        mimeType: "video/mp4",
        src: undefined,
        url: "https://example.com/clip.mp4",
        blobId: undefined,
        thumbnailDataUrl: undefined,
        storage_path: undefined,
        storage_url: undefined,
        thumbnail_storage_path: undefined,
        thumbnail_storage_url: undefined,
        audioDataUrl: undefined,
        audioBlobId: undefined,
        audioStoragePath: undefined,
        audioStorageUrl: undefined,
        audioMimeType: undefined,
        audioDuration: undefined,
      }),
      fixtureContextItem({
        id: "ctx-linked",
        caption: "linked project",
        linkedProjectId: "proj-42",
        linkedProjectSlug: "another-project",
      }),
    ],
    links: [
      { title: "Related Article", url: "https://example.com/article", source: "Example" },
      { title: "Source Material", url: "https://example.com/source", source: "Archive" },
    ],
    creativeCommons: {
      copyright: "Fixture Photographer 2026",
      description: "Caption for publication.",
    },
    ethics: {
      customEthicsText: "Custom code of ethics",
      noManipulation: true,
      manipulationDetails: "Only exposure corrected",
      noStaging: true,
      stagingDetails: "Documentary conditions",
      informedConsent: true,
      consentDetails: "Verbal consent on location",
      identityProtected: true,
      identityProtectionDetails: "Faces obscured",
      consentDocumentUrl:
        "https://abc.supabase.co/storage/v1/object/sign/consent-documents/doc.pdf",
      aiAltered: true,
      aiAlteredDetails: "Background AI-extended",
    },
    photographerInfo: {
      bio: "Fixture bio",
      contact: "fixture@example.com",
      website: "https://example.com",
      collaborators: "Fixture Collaborator",
    },
    location: {
      latitude: 40.7128,
      longitude: -74.006,
      city: "New York",
      state: "NY",
      country: "US",
      formattedLocation: "New York, NY, US",
      capturedAt: "2026-01-15T10:30:00Z",
      source: "manual",
      address: {
        street: "1 Test Way",
        street2: "Apt 2",
        city: "New York",
        district: "Manhattan",
        stateProvince: "NY",
        postalCode: "10001",
        country: "US",
      },
    },
    photoMetadata: {
      dateTaken: "2026-01-15T10:30:00Z",
      temporal: {
        dateTimeOriginal: "2026:01:15 10:30:00",
        offsetTimeOriginal: "-05:00",
      },
      gps: { altitude: 10, altitudeRef: 0, imgDirection: 180 },
      equipment: {
        cameraMake: "Canon",
        cameraModel: "EOS R5",
        lensModel: "RF 24-70mm F2.8L",
        focalLength: "50mm",
        iso: 400,
        aperture: "f/2.8",
        shutterSpeed: "1/250s",
      },
      device: { software: "Lightroom", artist: "Fixture" },
      image: { width: 8192, height: 5464, orientation: 1 },
    },
    voiceTranscriptions: [fixtureVoice()],
    meta: {
      createdAt: "2026-01-15T12:00:00.000Z",
      updatedAt: "2026-01-16T12:00:00.000Z",
      editorVersion: CURRENT_EXPORT_VERSION,
      mode: "complete",
    },
  };
}

const MAIN_IMAGE = "data:image/jpeg;base64,/9j/mainimage=";

// ── The contract ────────────────────────────────────────────────────────────

describe("export → import round trip", () => {
  it("is value-identical after canonicalization (Layer A)", () => {
    const original = fixtureMetadata();

    const exported = toFourCornersSchema(original, MAIN_IMAGE, false);
    const json = JSON.stringify(exported, null, 2);
    const result = parseMetadataText(json);

    expect(result.success, result.error).toBe(true);
    expect(canonicalizeForComparison(result.data!)).toEqual(
      canonicalizeForComparison(original),
    );
  });

  it("returns the main image alongside the metadata", () => {
    const exported = toFourCornersSchema(fixtureMetadata(), MAIN_IMAGE, false);
    const result = parseMetadataText(JSON.stringify(exported));
    expect(result.success, result.error).toBe(true);
    expect(result.mainImage).toBe(MAIN_IMAGE);
  });

  it("keeps genuine external references verbatim", () => {
    const exported = toFourCornersSchema(fixtureMetadata(), MAIN_IMAGE, false);
    const result = parseMetadataText(JSON.stringify(exported));
    const external = result.data!.context.find((i) => i.sourceType === "url");
    expect(external?.url).toBe("https://example.com/clip.mp4");
  });

  it("omits location when excludeLocation is set", () => {
    const exported = toFourCornersSchema(fixtureMetadata(), MAIN_IMAGE, true);
    const result = parseMetadataText(JSON.stringify(exported));
    expect(result.success, result.error).toBe(true);
    expect(result.data!.location).toBeUndefined();
  });

  it("survives a double round trip unchanged", () => {
    const original = fixtureMetadata();

    const firstPass = parseMetadataText(
      JSON.stringify(toFourCornersSchema(original, MAIN_IMAGE, false)),
    );
    expect(firstPass.success, firstPass.error).toBe(true);

    const secondPass = parseMetadataText(
      JSON.stringify(
        toFourCornersSchema(firstPass.data!, firstPass.mainImage, false),
      ),
    );
    expect(secondPass.success, secondPass.error).toBe(true);
    expect(canonicalizeForComparison(secondPass.data!)).toEqual(
      canonicalizeForComparison(original),
    );
  });
});
