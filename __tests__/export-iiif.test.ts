import { describe, it, expect } from "vitest";
import { generateIIIFManifest } from "@/lib/exportIIIF";
import type { FourCornersMetadataExtended } from "@/lib/schema";

function baseState(
  overrides: Partial<FourCornersMetadataExtended>,
): FourCornersMetadataExtended {
  return {
    backStory: { text: "", author: "", publication: "", publicationUrl: "", date: "" },
    context: [],
    links: [],
    creativeCommons: { copyright: "", description: "" },
    ethics: {},
    photographerInfo: {},
    location: {},
    photoMetadata: {},
    voiceTranscriptions: [],
    meta: { createdAt: "2026-06-12T00:00:00Z", updatedAt: "2026-06-12T00:00:00Z" },
    ...overrides,
  } as unknown as FourCornersMetadataExtended;
}

const metadataValue = (manifest: { metadata: Array<{ label: { en: string[] }; value: { en: string[] } }> }, label: string) =>
  manifest.metadata.find((m) => m.label.en[0] === label)?.value.en[0];

describe("generateIIIFManifest", () => {
  it("exports every link, not just the first", () => {
    const manifest = generateIIIFManifest(
      baseState({
        links: [
          { title: "First", url: "https://a.example", source: "" },
          { title: "Second", url: "https://b.example", source: "" },
          { title: "Third", url: "https://c.example", source: "" },
        ],
      }),
      "photo.jpg",
    );
    expect(manifest.homepage?.[0].id).toBe("https://a.example");
    const seeAlsoIds = (manifest.seeAlso ?? []).map((s) => s.id);
    expect(seeAlsoIds).toContain("https://b.example");
    expect(seeAlsoIds).toContain("https://c.example");
  });

  it("exports voice transcription texts as annotations without the source URL", () => {
    const manifest = generateIIIFManifest(
      baseState({
        voiceTranscriptions: [
          {
            id: "t1",
            recordingId: "r1",
            text: "Spoken note about the photo",
            transcribedAt: "2026-06-12T00:00:00Z",
            audioStoragePath: "user1/voice-recordings/p1/r1.webm",
            audioStorageUrl: "https://media.example.org/voice/whatever.webm",
          },
        ],
      }),
      "photo.jpg",
    );
    const json = JSON.stringify(manifest);
    expect(json).toContain("Spoken note about the photo");
    expect(json).toContain("./audio/r1.webm");
    expect(json).not.toContain("media.example.org");
  });

  it("skips transcripts duplicating the backstory annotation", () => {
    const manifest = generateIIIFManifest(
      baseState({
        backStory: { text: "Same story", author: "", publication: "", publicationUrl: "", date: "" },
        voiceTranscriptions: [
          {
            id: "t1",
            recordingId: "r1",
            text: "Same story",
            transcribedAt: "2026-06-12T00:00:00Z",
          },
        ],
      }),
      "photo.jpg",
    );
    const annotations = (manifest.items[0].annotations?.[0] as { items: unknown[] })?.items ?? [];
    expect(annotations).toHaveLength(1);
  });

  it("exports ethics detail texts to metadata", () => {
    const manifest = generateIIIFManifest(
      baseState({
        ethics: {
          noManipulation: true,
          noStaging: false,
          informedConsent: false,
          identityProtected: false,
          manipulationDetails: "Cropped only",
          aiAltered: true,
          aiAlteredDetails: "Sky replaced with AI",
        },
      }),
      "photo.jpg",
    );
    expect(metadataValue(manifest, "Ethics - Manipulation Details")).toBe("Cropped only");
    expect(metadataValue(manifest, "Ethics - AI Alteration Details")).toBe("Sky replaced with AI");
  });

  it("exports GPS and device composites", () => {
    const manifest = generateIIIFManifest(
      baseState({
        photoMetadata: {
          gps: { altitude: 120, speed: 4, speedRef: "K" },
          device: { software: "Lightroom", hostComputer: "iPhone 15 Pro", userComment: "edited" },
        },
      }),
      "photo.jpg",
    );
    expect(metadataValue(manifest, "GPS")).toContain("altitude 120");
    expect(metadataValue(manifest, "GPS")).toContain("speed 4 K");
    expect(metadataValue(manifest, "Processing")).toContain("Lightroom");
    expect(metadataValue(manifest, "Processing")).toContain("iPhone 15 Pro");
  });
});
