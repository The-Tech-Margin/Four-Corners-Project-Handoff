/**
 * Schema drift detection tests.
 *
 * Ensures the Zod schemas, DB column mappings, test factory, and
 * FIELD_REGISTRY stay in sync. If any of these fail, the data model
 * has drifted and TYPES.md should be regenerated:
 *   npx tsx scripts/generate-types-doc.ts
 */

import { describe, it, expect } from "vitest";
import type { ZodTypeAny, ZodObject, ZodRawShape } from "zod";
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
  FourCornersMetadataExtendedSchema,
  FIELD_REGISTRY,
  FIELD_INDEX,
} from "@/lib/field-registry";
import {
  createTestMetadata,
  createTestMetadataFull,
  createTestContextItem,
  createTestLink,
  createTestTranscription,
  createTestLocation,
  createTestPhotoMetadata,
} from "@/lib/test-factory";
import {
  EXPORT_STRIPPED_CONTEXT_FIELDS,
  EXPORT_STRIPPED_VOICE_FIELDS,
} from "@/lib/export-contract";
import { toFourCornersSchema } from "@/lib/schema";
import { parseMetadataText } from "@/lib/importMetadata";
import type { ContextItem, VoiceTranscription } from "@/lib/field-registry";

// ── Schema validation ──────────────────────────────────────────────────────

describe("Schema validation", () => {
  it("createTestMetadata produces valid minimal metadata", () => {
    const meta = createTestMetadata();
    const result = FourCornersMetadataExtendedSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  it("createTestMetadataFull produces valid full metadata", () => {
    const meta = createTestMetadataFull();
    const result = FourCornersMetadataExtendedSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  it("createTestContextItem produces valid context items", () => {
    const item = createTestContextItem({ caption: "test" });
    const result = ContextItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("createTestLink produces valid links", () => {
    const link = createTestLink();
    const result = LinkSchema.safeParse(link);
    expect(result.success).toBe(true);
  });

  it("createTestTranscription produces valid transcriptions", () => {
    const vt = createTestTranscription();
    const result = VoiceTranscriptionSchema.safeParse(vt);
    expect(result.success).toBe(true);
  });

  it("createTestLocation produces valid location", () => {
    const loc = createTestLocation();
    const result = LocationDataSchema.safeParse(loc);
    expect(result.success).toBe(true);
  });

  it("createTestPhotoMetadata produces valid photo metadata", () => {
    const pm = createTestPhotoMetadata();
    const result = PhotoMetadataSchema.safeParse(pm);
    expect(result.success).toBe(true);
  });
});

// ── Schema completeness ────────────────────────────────────────────────────

describe("Schema completeness", () => {
  it("all FIELD_REGISTRY paths resolve to actual schema fields", () => {
    const topLevelSchemas: Record<string, ZodTypeAny> = {
      backStory: BackStorySchema,
      creativeCommons: CreativeCommonsSchema,
      ethics: CodeOfEthicsSchema,
      photographerInfo: PhotographerInfoSchema,
      location: LocationDataSchema,
      photoMetadata: PhotoMetadataSchema,
    };

    for (const [path] of Object.entries(FIELD_REGISTRY)) {
      const parts = path.split(".");
      const schemaKey = parts[0];
      const schema = topLevelSchemas[schemaKey];
      if (!schema) continue; // Skip fields not in top-level schemas (context[], links[], etc.)

      // Walk into nested schemas
      let current = (schema as ZodObject<ZodRawShape>).shape;
      for (let i = 1; i < parts.length; i++) {
        expect(current).toBeDefined();
        const fieldSchema = current[parts[i]];
        expect(fieldSchema, `FIELD_REGISTRY path "${path}" — "${parts[i]}" not found in schema`).toBeDefined();

        // Unwrap optional/default to check for nested objects
        let unwrapped = fieldSchema;
        while (unwrapped?._def?.innerType) unwrapped = unwrapped._def.innerType;
        if ((unwrapped as ZodObject<ZodRawShape> | undefined)?.shape) current = (unwrapped as ZodObject<ZodRawShape>).shape;
        else break;
      }
    }
  });

  it("FIELD_INDEX has entries for all UI sections", () => {
    const expectedSections = ["backstory", "caption-credit-ethics", "location", "camera-metadata"];
    for (const section of expectedSections) {
      const fields = FIELD_INDEX.getBySection(section);
      expect(fields.length, `UI section "${section}" should have fields`).toBeGreaterThan(0);
    }
  });

  it("ContextItemSchema has all DB-persisted audio fields", () => {
    const shape = ContextItemSchema.shape;
    expect(shape.audioStoragePath).toBeDefined();
    expect(shape.audioStorageUrl).toBeDefined();
    expect(shape.audioMimeType).toBeDefined();
    expect(shape.audioDuration).toBeDefined();
  });

  it("ContextItemSchema has linked project fields", () => {
    const shape = ContextItemSchema.shape;
    expect(shape.linkedProjectId).toBeDefined();
    expect(shape.linkedProjectSlug).toBeDefined();
  });
});

// ── Full metadata round-trip ───────────────────────────────────────────────

describe("Full metadata round-trip", () => {
  it("full metadata survives parse → serialize → parse", () => {
    const original = createTestMetadataFull();
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json);
    const result = FourCornersMetadataExtendedSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("partial overrides merge correctly", () => {
    const meta = createTestMetadata({
      backStory: { text: "custom story" },
    });
    expect(meta.backStory.text).toBe("custom story");
    expect(meta.backStory.author).toBe(""); // default preserved
    expect(meta.context).toEqual([]); // default preserved
  });
});

// ── Export/import survival ──────────────────────────────────────────────────
// Every schema field must either be declared strippable in the export
// contract or survive toFourCornersSchema → JSON → parseMetadataText with its
// value intact. Adding a schema field that silently vanishes in transit
// fails here, naming the field.

describe("Export/import survival", () => {
  function sentinelValue(schema: ZodTypeAny, key: string): unknown {
    let s = schema;
    while (s?._def?.innerType) s = s._def.innerType;
    const typeName = s?._def?.typeName;
    if (typeName === "ZodNumber") return 42;
    if (typeName === "ZodEnum") return s._def.values[0];
    return `sentinel-${key}`;
  }

  function sentinelFromShape(shape: ZodRawShape): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(shape).map(([key, schema]) => [
        key,
        sentinelValue(schema, key),
      ]),
    );
  }

  function roundTrip(metadata: ReturnType<typeof createTestMetadata>) {
    const exported = toFourCornersSchema(metadata);
    const result = parseMetadataText(JSON.stringify(exported));
    expect(result.success, result.error).toBe(true);
    return result.data!;
  }

  it("every ContextItemSchema field survives export→import or is contract-stripped", () => {
    const sentinel = ContextItemSchema.parse(
      sentinelFromShape(ContextItemSchema.shape),
    ) as ContextItem;
    const imported = roundTrip(createTestMetadata({ context: [sentinel] }))
      .context[0] as Record<string, unknown>;

    for (const key of Object.keys(ContextItemSchema.shape)) {
      if (EXPORT_STRIPPED_CONTEXT_FIELDS.has(key)) {
        expect(
          imported[key],
          `ContextItemSchema.${key} is contract-stripped but leaked through export`,
        ).toBeUndefined();
      } else {
        expect(
          imported[key],
          `ContextItemSchema.${key} did not survive export→import — fix the pipeline or declare it in the export contract`,
        ).toEqual(sentinel[key as keyof ContextItem]);
      }
    }
  });

  it("every VoiceTranscriptionSchema field survives export→import or is contract-stripped", () => {
    const sentinel = VoiceTranscriptionSchema.parse(
      sentinelFromShape(VoiceTranscriptionSchema.shape),
    ) as VoiceTranscription;
    const imported = roundTrip(
      createTestMetadata({ voiceTranscriptions: [sentinel] }),
    ).voiceTranscriptions![0] as Record<string, unknown>;

    for (const key of Object.keys(VoiceTranscriptionSchema.shape)) {
      if (EXPORT_STRIPPED_VOICE_FIELDS.has(key)) {
        expect(
          imported[key],
          `VoiceTranscriptionSchema.${key} is contract-stripped but leaked through export`,
        ).toBeUndefined();
      } else {
        expect(
          imported[key],
          `VoiceTranscriptionSchema.${key} did not survive export→import — fix the pipeline or declare it in the export contract`,
        ).toEqual(sentinel[key as keyof VoiceTranscription]);
      }
    }
  });
});
