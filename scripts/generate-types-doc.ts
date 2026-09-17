#!/usr/bin/env npx tsx
/**
 * Generate TYPES.md from Zod schemas and field registry.
 *
 * Usage: npx tsx scripts/generate-types-doc.ts
 *
 * This makes TYPES.md a generated artifact — never edit it by hand.
 * The Zod schemas in lib/field-registry.ts are the single source of truth.
 */

import { z, type ZodTypeAny } from "zod";
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
  FIELD_REGISTRY,
  type FieldDefinition,
} from "../lib/field-registry";
import * as fs from "fs";
import * as path from "path";

// ── Zod introspection helpers ──────────────────────────────────────────────

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  dbColumn?: string;
}

/** DB column name mapping (camelCase → snake_case with overrides) */
const DB_COLUMN_MAP: Record<string, string> = {
  // Context items
  sourceType: "source_type",
  mimeType: "mime_type",
  type: "media_type",
  storage_path: "storage_path",
  storage_url: "storage_url",
  thumbnail_storage_path: "thumbnail_storage_path",
  thumbnail_storage_url: "thumbnail_storage_url",
  audioStoragePath: "audio_storage_path",
  audioStorageUrl: "audio_storage_url",
  audioMimeType: "audio_mime_type",
  audioDuration: "audio_duration",
  audioDataUrl: "—",
  thumbnailDataUrl: "—",
  blobId: "—",
  src: "—",
  linkedProjectId: "linked_project_id",
  linkedProjectSlug: "linked_project_slug",
  // Backstory
  publicationUrl: "publication_url",
  // Ethics
  customEthicsText: "custom_ethics_text",
  noManipulation: "no_manipulation",
  manipulationDetails: "manipulation_details",
  noStaging: "no_staging",
  stagingDetails: "staging_details",
  informedConsent: "informed_consent",
  consentDetails: "consent_details",
  identityProtected: "identity_protected",
  identityProtectionDetails: "identity_protection_details",
  consentDocumentUrl: "consent_document_url",
  aiAltered: "ai_altered",
  aiAlteredDetails: "ai_altered_details",
  // Location
  formattedLocation: "formatted_location",
  capturedAt: "captured_at",
  stateProvince: "state_province",
  postalCode: "postal_code",
  // Photo metadata
  dateTaken: "date_taken",
  cameraMake: "camera_make",
  cameraModel: "camera_model",
  lensModel: "lens_model",
  focalLength: "focal_length",
  shutterSpeed: "shutter_speed",
  hostComputer: "host_computer",
  userComment: "user_comment",
  imageDescription: "image_description",
  // Voice transcriptions
  recordingId: "recording_id",
  transcribedAt: "transcribed_at",
  fieldId: "field_id",
};

function getDbColumn(fieldName: string): string {
  if (DB_COLUMN_MAP[fieldName]) return DB_COLUMN_MAP[fieldName];
  // Default: camelCase → snake_case
  return fieldName.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function describeZodType(schema: ZodTypeAny): string {
  if (schema instanceof z.ZodString) return "`string`";
  if (schema instanceof z.ZodNumber) return "`number`";
  if (schema instanceof z.ZodBoolean) return "`boolean`";
  if (schema instanceof z.ZodEnum) {
    const vals = (schema as z.ZodEnum<[string, ...string[]]>)._def.values;
    return vals.map((v: string) => `\`"${v}"\``).join(" \\| ");
  }
  if (schema instanceof z.ZodOptional) return describeZodType(schema.unwrap());
  if (schema instanceof z.ZodDefault) return describeZodType(schema._def.innerType);
  if (schema instanceof z.ZodNullable) return describeZodType(schema.unwrap()) + " \\| null";
  if (schema instanceof z.ZodUnion) {
    const types = schema._def.options.map((o: ZodTypeAny) => describeZodType(o));
    return [...new Set(types)].join(" \\| ");
  }
  if (schema instanceof z.ZodObject) return "`object`";
  if (schema instanceof z.ZodArray) return "`array`";
  return "`unknown`";
}

function isRequired(schema: ZodTypeAny): boolean {
  if (schema instanceof z.ZodOptional) return false;
  if (schema instanceof z.ZodDefault) return false;
  return true;
}

function getDescription(schema: ZodTypeAny): string | undefined {
  if (schema._def.description) return schema._def.description;
  if (schema instanceof z.ZodOptional) return getDescription(schema.unwrap());
  if (schema instanceof z.ZodDefault) return getDescription(schema._def.innerType);
  return undefined;
}

function extractFields(schema: z.ZodObject<any>, registryPrefix?: string): FieldInfo[] {
  const shape = schema.shape;
  const fields: FieldInfo[] = [];
  for (const [name, fieldSchema] of Object.entries(shape)) {
    const zField = fieldSchema as ZodTypeAny;
    const registryKey = registryPrefix ? `${registryPrefix}.${name}` : undefined;
    const registryEntry = registryKey ? FIELD_REGISTRY[registryKey] : undefined;

    fields.push({
      name,
      type: describeZodType(zField),
      required: isRequired(zField),
      description: getDescription(zField) || registryEntry?.label,
      dbColumn: getDbColumn(name),
    });
  }
  return fields;
}

function fieldsToTable(fields: FieldInfo[], includeDb = true): string {
  const header = includeDb
    ? "| Field | Type | Required | DB Column | Description |"
    : "| Field | Type | Required | Description |";
  const divider = includeDb
    ? "|-------|------|----------|-----------|-------------|"
    : "|-------|------|----------|-------------|";

  const rows = fields.map((f) => {
    const req = f.required ? "yes" : "no";
    const desc = f.description || "";
    const db = f.dbColumn || "—";
    return includeDb
      ? `| \`${f.name}\` | ${f.type} | ${req} | \`${db}\` | ${desc} |`
      : `| \`${f.name}\` | ${f.type} | ${req} | ${desc} |`;
  });

  return [header, divider, ...rows].join("\n");
}

function extractNestedFields(
  schema: z.ZodObject<any>,
  parentName: string,
  parentDb: string,
): FieldInfo[] {
  const shape = schema.shape;
  const fields: FieldInfo[] = [];
  for (const [name, fieldSchema] of Object.entries(shape)) {
    const zField = fieldSchema as ZodTypeAny;
    fields.push({
      name: `${parentName}.${name}`,
      type: describeZodType(zField),
      required: isRequired(zField),
      description: getDescription(zField),
      dbColumn: DB_COLUMN_MAP[name] || getDbColumn(name),
    });
  }
  return fields;
}

// ── Generate document ──────────────────────────────────────────────────────

// No wall-clock "generated on" date is emitted: it made TYPES.md change on every
// run, so the CI freshness check (git diff --exit-code) failed on any day other
// than the last commit. The doc should track schema changes, not the calendar.
let doc = `# Four Corners Data Model Reference

> **Generated from Zod schemas** — do not edit by hand.
> Run \`npx tsx scripts/generate-types-doc.ts\` to regenerate.
>
> **Runtime source**: \`lib/field-registry.ts\`
> **DB mapping**: \`lib/db/projects-transforms.ts\`

---

## Upper-Left Corner: Context (Related Imagery)

Rich media items that provide visual context for the photograph.

**Schema**: \`ContextItemSchema[]\` (array, required, can be empty)
**DB table**: \`context_items\`

${fieldsToTable(extractFields(ContextItemSchema))}

**Related table**: \`context_item_audio\` (junction, 1:many audio per context item)

---

## Upper-Right Corner: Links

External resources and references related to the photograph.

**Schema**: \`LinkSchema[]\` (array, required, can be empty)
**DB table**: \`links\`

${fieldsToTable(extractFields(LinkSchema))}

---

## Bottom-Left Corner: Backstory

The photographer's narrative and publication context.

**Schema**: \`BackStorySchema\` (object, required, never null)
**DB table**: \`project_backstory\` (1:1)

${fieldsToTable(extractFields(BackStorySchema, "backStory"))}

---

## Bottom-Right Corner: Creative Commons, Ethics & Photographer

### Creative Commons / Copyright

**Schema**: \`CreativeCommonsSchema\` (object, required, never null)
**DB table**: \`project_creative_commons\` (1:1)

${fieldsToTable(extractFields(CreativeCommonsSchema, "creativeCommons"))}

### Code of Ethics

**Schema**: \`CodeOfEthicsSchema\` (object, optional)
**DB table**: \`project_ethics\` (1:1)

${fieldsToTable(extractFields(CodeOfEthicsSchema, "ethics"))}

### Photographer Info

**Schema**: \`PhotographerInfoSchema\` (object, optional)
**DB table**: \`project_photographer_info\` (1:1)

${fieldsToTable(extractFields(PhotographerInfoSchema, "photographerInfo"))}

---

## Cross-Cutting: Location

Geographic data for where the photograph was taken.

**Schema**: \`LocationDataSchema\` (object, optional)
**DB table**: \`project_locations\` (1:1, PostGIS)

${fieldsToTable(extractFields(LocationDataSchema, "location"))}

### Nested: Address Detail

${fieldsToTable(
  extractNestedFields(
    (LocationDataSchema.shape.address as z.ZodOptional<z.ZodObject<any>>).unwrap(),
    "address",
    "address",
  ),
)}

---

## Cross-Cutting: Photo Metadata (EXIF)

Technical metadata extracted from the image file.

**Schema**: \`PhotoMetadataSchema\` (object, optional)
**DB table**: \`photo_metadata\` (1:1)

| Field | Type | DB Column | Description |
|-------|------|-----------|-------------|
| \`dateTaken\` | \`string \\| null\` | \`date_taken\` | Date/time photo was taken |

### Equipment

${fieldsToTable(
  extractNestedFields(
    (PhotoMetadataSchema.shape.equipment as z.ZodOptional<z.ZodObject<any>>).unwrap(),
    "equipment",
    "equipment",
  ),
)}

### Image Dimensions

${fieldsToTable(
  extractNestedFields(
    (PhotoMetadataSchema.shape.image as z.ZodOptional<z.ZodObject<any>>).unwrap(),
    "image",
    "image",
  ),
)}

### Device / Software

${fieldsToTable(
  extractNestedFields(
    (PhotoMetadataSchema.shape.device as z.ZodOptional<z.ZodObject<any>>).unwrap(),
    "device",
    "device",
  ),
)}

### Temporal (EXIF timestamps)

Stored as JSON in DB column \`temporal_data\`.

${fieldsToTable(
  extractNestedFields(
    (PhotoMetadataSchema.shape.temporal as z.ZodOptional<z.ZodObject<any>>).unwrap(),
    "temporal",
    "temporal",
  ),
  false,
)}

### GPS Extended

Stored as JSON in DB column \`gps_extended\`.

${fieldsToTable(
  extractNestedFields(
    (PhotoMetadataSchema.shape.gps as z.ZodOptional<z.ZodObject<any>>).unwrap(),
    "gps",
    "gps",
  ),
  false,
)}

---

## Cross-Cutting: Voice Transcriptions

Audio recordings with transcriptions, attachable to any field via \`fieldId\`.

**Schema**: \`VoiceTranscriptionSchema[]\` (array, optional)
**DB table**: \`voice_transcriptions\`

${fieldsToTable(extractFields(VoiceTranscriptionSchema))}

---

## System: Meta

**Schema**: \`MetaSchema\` (object, optional)

${fieldsToTable(extractFields(MetaSchema), false)}

---

## Top-Level Schema Shape

\`\`\`typescript
interface FourCornersMetadataExtended {
  backStory: BackStory;                       // required, never null
  context: ContextItem[];                     // required, can be empty
  links: Link[];                              // required, can be empty
  creativeCommons: CreativeCommons;           // required, never null
  ethics?: CodeOfEthics;                      // optional
  photographerInfo?: PhotographerInfo;        // optional
  location?: LocationData;                    // optional
  photoMetadata?: PhotoMetadata;              // optional
  voiceTranscriptions?: VoiceTranscription[]; // optional
  meta?: Meta;                                // optional
}
\`\`\`

---

## Field Registry Summary

The \`FIELD_REGISTRY\` in \`lib/field-registry.ts\` maps ${Object.keys(FIELD_REGISTRY).length} fields with indexed lookups by:
- **Path**: \`FIELD_INDEX.getByPath("backStory.text")\`
- **UI section**: \`FIELD_INDEX.getBySection("backstory")\`
- **Canvas corner**: \`FIELD_INDEX.getByCanvasCorner("cc")\`
- **IIIF section**: \`FIELD_INDEX.getByIIIFSection("metadata")\`

## DB Architecture

- **1:1 tables**: \`project_backstory\`, \`project_creative_commons\`, \`project_photographer_info\`, \`project_ethics\`, \`project_locations\` (PostGIS), \`photo_metadata\`
- **1:many tables**: \`context_items\`, \`links\`, \`voice_transcriptions\`
- **Junction**: \`context_item_audio\` (1:many audio per context item)
- **All tables**: RLS enabled, ON DELETE CASCADE from \`projects\`
- **Read path**: \`buildMetadataFromNormalized()\` in \`lib/db/projects-transforms.ts\`
- **Write path**: \`syncNormalizedTables()\` in \`hooks/useProjectSave.ts\`
`;

const outPath = path.resolve(__dirname, "..", "TYPES.md");
fs.writeFileSync(outPath, doc, "utf-8");
console.log(`Generated ${outPath} (${doc.length} chars, ${Object.keys(FIELD_REGISTRY).length} registry fields)`);
