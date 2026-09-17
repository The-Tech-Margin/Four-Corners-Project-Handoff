/**
 * EXPORT/IMPORT CONTRACT
 *
 * Single source of truth shared by the export and import paths:
 * the export format version, the field sets that may legally be
 * stripped in transit, and the canonical comparison that defines
 * what a "1:1 round trip" means.
 *
 * Round trip: export → import → save (any account) → reload.
 * After `canonicalizeForComparison`, both legs must deep-equal.
 *
 * Allowed to differ across a round trip (and therefore excluded
 * from the canonical comparison):
 * - project id / slug / title (not part of metadata)
 * - storage paths and URLs (media is re-uploaded by the importer's account)
 * - `meta.updatedAt` and `meta.editorVersion` (restamped on import/save)
 * - DB row ids and client UUIDs (regenerated to avoid PK collisions)
 * - thumbnails (derived; regenerated on import)
 * - `ethics.consentDocumentUrl` (references the exporter's account)
 */

import { z } from "zod";
import {
  BackStorySchema,
  CodeOfEthicsSchema,
  ContextItemSchema,
  CreativeCommonsSchema,
  FourCornersMetadataExtendedSchema,
  LinkSchema,
  LocationDataSchema,
  MetaSchema,
  PhotoMetadataSchema,
  PhotographerInfoSchema,
  VoiceTranscriptionSchema,
} from "./field-registry";
import type {
  ContextItem,
  VoiceTranscription,
  FourCornersMetadataExtended,
} from "./field-registry";

export const CURRENT_EXPORT_VERSION = "1.1.0";

const KNOWN_EXPORT_VERSIONS: ReadonlySet<string> = new Set([
  "1.0.0",
  CURRENT_EXPORT_VERSION,
]);

// ── Field sets ──────────────────────────────────────────────────────────────
// `satisfies readonly (keyof ...)[]` makes a schema rename a build error here
// instead of a silently-empty strip.

const EPHEMERAL_CONTEXT_FIELD_LIST = [
  "blobId",
  "thumbnailDataUrl",
  "audioDataUrl",
  "audioBlobId",
] as const satisfies readonly (keyof ContextItem)[];

const EPHEMERAL_VOICE_FIELD_LIST = [
  "audioDataUrl",
  "audioBlobId",
] as const satisfies readonly (keyof VoiceTranscription)[];

const IDENTITY_CONTEXT_FIELD_LIST = [
  "storage_path",
  "storage_url",
  "thumbnail_storage_path",
  "thumbnail_storage_url",
  "audioStoragePath",
  "audioStorageUrl",
] as const satisfies readonly (keyof ContextItem)[];

const IDENTITY_VOICE_FIELD_LIST = [
  "audioStoragePath",
  "audioStorageUrl",
] as const satisfies readonly (keyof VoiceTranscription)[];

// Internal storage paths embed the exporter's user id and are useless to any
// other account — exports strip them alongside the ephemerals, while public
// `*_url` fields stay so exported files remain viewable.
const INTERNAL_PATH_CONTEXT_FIELD_LIST = [
  "storage_path",
  "thumbnail_storage_path",
  "audioStoragePath",
] as const satisfies readonly (keyof ContextItem)[];

const INTERNAL_PATH_VOICE_FIELD_LIST = [
  "audioStoragePath",
] as const satisfies readonly (keyof VoiceTranscription)[];

/** Client-session-only context fields — never valid in an export or the DB. */
export const EPHEMERAL_CONTEXT_FIELDS: ReadonlySet<string> = new Set(
  EPHEMERAL_CONTEXT_FIELD_LIST,
);

/** Client-session-only voice fields — never valid in an export or the DB. */
export const EPHEMERAL_VOICE_FIELDS: ReadonlySet<string> = new Set(
  EPHEMERAL_VOICE_FIELD_LIST,
);

/** Context fields tied to the exporting account's storage identity. */
export const IDENTITY_CONTEXT_FIELDS: ReadonlySet<string> = new Set(
  IDENTITY_CONTEXT_FIELD_LIST,
);

/** Voice fields tied to the exporting account's storage identity. */
export const IDENTITY_VOICE_FIELDS: ReadonlySet<string> = new Set(
  IDENTITY_VOICE_FIELD_LIST,
);

/** Everything `toFourCornersSchema` strips from context items on export. */
export const EXPORT_STRIPPED_CONTEXT_FIELDS: ReadonlySet<string> = new Set([
  ...EPHEMERAL_CONTEXT_FIELD_LIST,
  ...INTERNAL_PATH_CONTEXT_FIELD_LIST,
]);

/** Everything `toFourCornersSchema` strips from voice transcriptions on export. */
export const EXPORT_STRIPPED_VOICE_FIELDS: ReadonlySet<string> = new Set([
  ...EPHEMERAL_VOICE_FIELD_LIST,
  ...INTERNAL_PATH_VOICE_FIELD_LIST,
]);

/** Return a copy of `item` without the given fields. */
export function omitEphemeral<T extends object>(
  item: T,
  fields: ReadonlySet<string>,
): T {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => !fields.has(key)),
  ) as T;
}

// ── Export manifest ─────────────────────────────────────────────────────────
// Lives at `_ext.export` in metadata.json. Importers must read it from the
// raw JSON BEFORE Zod strip-parsing deletes unknown keys. All paths are
// ZIP-relative.

/**
 * Who made the file. Carried in the metadata, never rendered: it tells a
 * reader which system wrote the bundle and which format version to expect.
 */
export const ExportGeneratorSchema = z
  .object({
    name: z.string(),
    designAndBuild: z.string(),
    url: z.string(),
    formatVersion: z.string(),
  })
  .passthrough();

export type ExportGenerator = z.infer<typeof ExportGeneratorSchema>;

export const ExportManifestSchema = z.object({
  version: z.string(),
  generator: ExportGeneratorSchema.optional(),
  assets: z.object({
    mainImage: z
      .object({
        path: z.string(),
        mimeType: z.string().optional(),
        thumbnailPath: z.string().optional(),
      })
      .optional(),
    context: z
      .array(
        z.object({
          id: z.string(),
          mediaPath: z.string().optional(),
          thumbnailPath: z.string().optional(),
          audioPath: z.string().optional(),
          audioMimeType: z.string().optional(),
        }),
      )
      .default([]),
    voice: z
      .array(
        z.object({
          id: z.string(),
          audioPath: z.string(),
          mimeType: z.string().optional(),
        }),
      )
      .default([]),
    consentDocs: z
      .array(
        z.object({
          name: z.string(),
          path: z.string(),
          mimeType: z.string(),
          size: z.number(),
        }),
      )
      .default([]),
  }),
});

export type ExportManifest = z.infer<typeof ExportManifestSchema>;

// ── Export envelope ─────────────────────────────────────────────────────────
// The shape of metadata.json: the four corners at the root (the layout
// fourcorners.js reads) and everything this editor adds under `_ext`.

const ExportContextItemSchema = ContextItemSchema.omit({
  blobId: true,
  thumbnailDataUrl: true,
  storage_path: true,
  thumbnail_storage_path: true,
  audioStoragePath: true,
});

const ExportVoiceSchema = VoiceTranscriptionSchema.omit({
  audioBlobId: true,
  audioStoragePath: true,
});

const ExportConsentDocumentSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  size: z.number().optional(),
  uploadedAt: z.string().optional(),
  dataUrl: z.string().optional(),
});

export const ExportEnvelopeSchema = z.object({
  backStory: BackStorySchema,
  context: z.array(ExportContextItemSchema),
  links: z.array(LinkSchema),
  creativeCommons: CreativeCommonsSchema,
  _ext: z.object({
    ethics: CodeOfEthicsSchema.optional(),
    photographerInfo: PhotographerInfoSchema.optional(),
    location: LocationDataSchema.optional(),
    photoMetadata: PhotoMetadataSchema.optional(),
    voiceTranscriptions: z.array(ExportVoiceSchema).optional(),
    meta: MetaSchema.optional(),
    mainImage: z.string().optional(),
    consentDocuments: z.array(ExportConsentDocumentSchema).optional(),
    export: ExportManifestSchema,
  }),
});

export type ExportEnvelope = z.infer<typeof ExportEnvelopeSchema>;

// ── Version handling ────────────────────────────────────────────────────────

/**
 * Check an incoming export's declared version. Unknown/newer versions warn
 * but never hard-fail — imports proceed best-effort. A missing version is
 * treated as legacy (pre-manifest) and imports silently.
 */
export function checkExportVersion(version: string | undefined): {
  known: boolean;
  warning?: string;
} {
  if (!version || KNOWN_EXPORT_VERSIONS.has(version)) {
    return { known: true };
  }
  return {
    known: false,
    warning: `File was exported by a newer or unknown editor version (${version}) — importing on a best-effort basis`,
  };
}

// ── Canonical comparison (the executable 1:1 contract) ─────────────────────

const COMPARISON_EXCLUDED_ETHICS_FIELDS: ReadonlySet<string> = new Set([
  "consentDocumentUrl",
]);

/**
 * `src`/`url` values that point at bundled, embedded, or account-hosted
 * bytes collapse to a placeholder — the bytes themselves are compared by
 * hash (Layer B), not by reference. Genuine external references are kept
 * verbatim because the URL *is* the content.
 */
function normalizeAssetRef(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const isExternal =
    /^https?:\/\//.test(ref) &&
    !/\/storage\/v1\/object\/(public|sign)\//.test(ref);
  return isExternal ? ref : "<asset>";
}

/**
 * Reduce metadata to the value-identity the round-trip contract guarantees:
 * parse through the schema (canonicalizes defaults), strip ephemeral and
 * identity fields, replace client ids by array position, mirror `src`/`url`
 * the way import does, and collapse asset-backed refs to a placeholder.
 */
export function canonicalizeForComparison(
  metadata: FourCornersMetadataExtended,
): Record<string, unknown> {
  const parsed = FourCornersMetadataExtendedSchema.parse(metadata);

  const context = parsed.context.map((item, index) => {
    const stripped = omitEphemeral(
      omitEphemeral(item, EPHEMERAL_CONTEXT_FIELDS),
      IDENTITY_CONTEXT_FIELDS,
    );
    // An item whose bytes live in IDB or account storage is asset-backed
    // even with no src/url set (bundle imports stage blobs and clear refs) —
    // both legs collapse to the same placeholder; bytes are Layer B.
    const assetBacked =
      typeof item.blobId === "number" ||
      !!item.storage_path ||
      !!item.storage_url;
    const fallbackRef = assetBacked ? "<asset>" : undefined;
    return {
      ...stripped,
      id: `context-${index}`,
      src: normalizeAssetRef(item.src || item.url || undefined) ?? fallbackRef,
      url: normalizeAssetRef(item.url || item.src || undefined) ?? fallbackRef,
    };
  });

  const voiceTranscriptions = parsed.voiceTranscriptions?.map((vt, index) => {
    const stripped = omitEphemeral(
      omitEphemeral(vt, EPHEMERAL_VOICE_FIELDS),
      IDENTITY_VOICE_FIELDS,
    );
    return {
      ...stripped,
      id: `voice-${index}`,
      recordingId: `voice-${index}`,
    };
  });

  return {
    backStory: parsed.backStory,
    context,
    links: parsed.links,
    creativeCommons: parsed.creativeCommons,
    ethics: parsed.ethics
      ? omitEphemeral(parsed.ethics, COMPARISON_EXCLUDED_ETHICS_FIELDS)
      : undefined,
    photographerInfo: parsed.photographerInfo,
    location: parsed.location,
    photoMetadata: parsed.photoMetadata,
    voiceTranscriptions,
    meta: parsed.meta
      ? { createdAt: parsed.meta.createdAt, mode: parsed.meta.mode }
      : undefined,
  };
}
