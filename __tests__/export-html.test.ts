/**
 * HTML viewer generation: every populated registry field renders, user
 * content is escaped, media tags appear, and the embedded #fc-metadata JSON
 * round-trips through the import pipeline.
 */

import { describe, it, expect } from "vitest";
import { buildStandaloneHtml, type ExportEnvelope } from "@/lib/export/html";
import { escapeHtml } from "@/lib/export/escape";
import { buildExportMetadata } from "@/lib/export/serialize";
import { resolveAssets } from "@/lib/export/assets";
import { extractMetadataFromHtml } from "@/lib/importHtml";
import { parseMetadataText } from "@/lib/importMetadata";
import { generateHtmlExport } from "@/lib/exportHtml";
import { FIELD_REGISTRY } from "@/lib/field-registry";
import { getValueByPath, hasValue } from "@/lib/field-utils";
import type { FourCornersMetadataExtended } from "@/lib/field-registry";

function fixtureMetadata(): FourCornersMetadataExtended {
  return {
    backStory: {
      text: "The full backstory text.",
      author: "Fixture Author",
      publication: "Fixture Publication",
      publicationUrl: "https://example.com/publication",
      date: "2026-01-15",
    },
    context: [
      {
        id: "ctx-1",
        sourceType: "upload",
        type: "image",
        caption: "Context caption",
        description: "Context alt description",
        credit: "Context credit",
        date: "2026-01-14",
        filename: "pic.png",
        mimeType: "image/png",
        src: "data:image/png;base64,cGlj",
        audioDataUrl: "data:audio/webm;base64,YXVkaW8=",
        audioMimeType: "audio/webm",
        linkedProjectSlug: "sister-project",
      },
      {
        id: "ctx-2",
        sourceType: "url",
        type: "video",
        caption: "External video",
        url: "https://example.com/clip.mp4",
      },
    ],
    links: [
      { title: "Related Article", url: "https://example.com/article", source: "Example" },
    ],
    creativeCommons: {
      copyright: "Fixture Photographer 2026",
      description: "Publication caption",
    },
    ethics: {
      customEthicsText: "Custom ethics statement",
      noManipulation: true,
      manipulationDetails: "Only tonal edits",
      noStaging: true,
      stagingDetails: "Documentary scene",
      informedConsent: true,
      consentDetails: "Verbal consent recorded",
      identityProtected: true,
      identityProtectionDetails: "Faces blurred",
      aiAltered: true,
      aiAlteredDetails: "Sky AI-extended",
    },
    photographerInfo: {
      bio: "Photographer biography",
      contact: "contact@example.com",
      website: "https://example.com/portfolio",
      collaborators: "Fixture Collaborator",
    },
    location: {
      latitude: 40.7128,
      longitude: -74.006,
      city: "New York",
      formattedLocation: "New York, NY, US",
      address: { street: "1 Test Way", city: "New York", country: "US" },
    },
    photoMetadata: {
      dateTaken: "2026-01-15T10:30:00Z",
      equipment: {
        cameraMake: "Canon",
        cameraModel: "EOS R5",
        lensModel: "RF 24-70mm",
        focalLength: "50mm",
        iso: 400,
        aperture: "f/2.8",
        shutterSpeed: "1/250s",
      },
    },
    voiceTranscriptions: [
      {
        id: "vt-1",
        recordingId: "rec-1",
        text: "Spoken voice note transcript",
        transcribedAt: "2026-01-15T09:00:00.000Z",
        audioDataUrl: "data:audio/webm;base64,dm9pY2U=",
        mimeType: "audio/webm",
      },
    ],
    meta: {
      createdAt: "2026-01-15T12:00:00.000Z",
      updatedAt: "2026-01-16T12:00:00.000Z",
      editorVersion: "1.1.0",
      mode: "complete",
    },
  };
}

async function fixtureEnvelope(
  metadata = fixtureMetadata(),
): Promise<ExportEnvelope> {
  const input = {
    metadata,
    title: "HTML Test",
    mainImage: { src: "data:image/jpeg;base64,bWFpbg==" },
    consentDocuments: [
      {
        name: "consent.pdf",
        size: 3,
        type: "application/pdf",
        dataUrl: "data:application/pdf;base64,cGRm",
      },
    ],
  };
  const options = {
    format: "html-standalone" as const,
    embedImages: true,
    excludeLocation: false,
    includeExif: true,
    includeConsentDocs: true,
  };
  const assets = await resolveAssets(input, options, undefined, {
    getIdbBlob: async () => undefined,
    fetchFn: (async () => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch,
    signStoragePath: async () => null,
  });
  const envelope = await buildExportMetadata(input, options, assets, "embedded");
  return envelope as unknown as ExportEnvelope;
}

describe("buildStandaloneHtml", () => {
  it("renders every populated FIELD_REGISTRY value (labels for booleans)", async () => {
    const metadata = fixtureMetadata();
    const html = buildStandaloneHtml(await fixtureEnvelope(metadata));

    for (const field of Object.values(FIELD_REGISTRY)) {
      const value = getValueByPath(
        metadata as unknown as Record<string, unknown>,
        field.path,
      );
      if (!hasValue(value)) continue;
      if (field.fieldType === "boolean") {
        if (value === true) {
          expect(
            html,
            `boolean field ${field.path} should render its badge label`,
          ).toContain(escapeHtml(field.label));
        }
        continue;
      }
      expect(
        html,
        `field ${field.path} value should appear in the viewer`,
      ).toContain(escapeHtml(String(value)));
    }
  });

  it("renders context detail fields, media tags, and voice transcripts", async () => {
    const html = buildStandaloneHtml(await fixtureEnvelope());
    expect(html).toContain("Context caption");
    expect(html).toContain("Context alt description");
    expect(html).toContain("Credit: Context credit");
    expect(html).toContain("sister-project");
    expect(html).toContain("<video");
    expect(html).toContain("<audio");
    expect(html).toContain("Spoken voice note transcript");
    expect(html).toContain("consent.pdf");
  });

  it("escapes hostile user content", async () => {
    const metadata = fixtureMetadata();
    metadata.creativeCommons.description = '</script><script>alert("xss")</script>';
    const html = buildStandaloneHtml(await fixtureEnvelope(metadata));
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("embeds importable canonical JSON in #fc-metadata", async () => {
    const html = buildStandaloneHtml(await fixtureEnvelope());
    const extraction = extractMetadataFromHtml(html);
    expect(extraction.metadataText).toBeTruthy();

    const result = parseMetadataText(extraction.metadataText!);
    expect(result.success, result.error).toBe(true);
    expect(result.data!.backStory.author).toBe("Fixture Author");
    expect(result.data!.ethics?.aiAlteredDetails).toBe("Sky AI-extended");
    expect(result.mainImage).toMatch(/^data:image\/jpeg/);
  });

  it("survives hostile content inside the embedded JSON", async () => {
    const metadata = fixtureMetadata();
    metadata.backStory.text = 'Story with </script> terminator inside';
    const html = buildStandaloneHtml(await fixtureEnvelope(metadata));
    const extraction = extractMetadataFromHtml(html);
    const result = parseMetadataText(extraction.metadataText!);
    expect(result.success, result.error).toBe(true);
    expect(result.data!.backStory.text).toBe(
      "Story with </script> terminator inside",
    );
  });
});

describe("data-4c-meta variant (CDN snippet)", () => {
  it("is also extractable and importable", () => {
    const html = generateHtmlExport(
      fixtureMetadata(),
      "data:image/jpeg;base64,bWFpbg==",
      { mode: "snippet", imageSource: "embed", includeRawMetadata: true },
    );
    const extraction = extractMetadataFromHtml(html);
    expect(extraction.metadataText).toBeTruthy();
    const result = parseMetadataText(extraction.metadataText!);
    expect(result.success, result.error).toBe(true);
    expect(result.data!.backStory.author).toBe("Fixture Author");
  });
});
