/* eslint-disable @typescript-eslint/no-explicit-any -- walks untyped JSON Schema nodes */
/**
 * generate-schema.ts — JSON Schema for the Four Corners object model.
 *
 * The Zod schemas in lib/field-registry.ts are the source of truth; this
 * turns them into language-neutral JSON Schema so anyone porting the model
 * can generate types, validate documents, or build a database from it
 * without reading TypeScript.
 *
 * Outputs (generated — do not hand-edit):
 *   schema/project.schema.json        the metadata document
 *   schema/export-bundle.schema.json  the file an export writes
 *
 * Run: npm run generate:schema
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { FIELD_REGISTRY, FourCornersMetadataExtendedSchema } from "../lib/field-registry";
import { CURRENT_EXPORT_VERSION, ExportEnvelopeSchema } from "../lib/export-contract";
import { GENERATOR } from "../lib/attribution";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "schema");

/**
 * URNs, not URLs: a schema id should identify the model, not promise that
 * somebody keeps a web server running at that address.
 */
const PROJECT_ID = `urn:four-corners:project:${CURRENT_EXPORT_VERSION}`;
const BUNDLE_ID = `urn:four-corners:export-bundle:${CURRENT_EXPORT_VERSION}`;

function convert(schema: Parameters<typeof zodToJsonSchema>[0], id: string, title: string) {
  const converted = zodToJsonSchema(schema, {
    target: "jsonSchema7",
    // Inline everything: one readable document, and a diff that only moves
    // when the model moves.
    $refStrategy: "none",
    // Emit what a writer must supply, so `z.preprocess` fields describe their
    // input rather than an empty object.
    effectStrategy: "input",
  }) as Record<string, any>;

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: id,
    title,
    $comment: GENERATOR,
    ...converted,
  };
}

/** Walk a dotted field path into the generated schema's properties. */
function nodeAtPath(root: any, path: string): any | null {
  let node = root;
  for (const segment of path.split(".")) {
    node = node?.properties?.[segment];
    if (!node) return null;
  }
  return node;
}

/**
 * Carry the registry's editorial knowledge into the schema: the label a
 * person sees, where the field sits in the four-corners model, and how it
 * maps to IIIF.
 */
function annotate(schema: any): { annotated: number; missing: string[] } {
  const missing: string[] = [];
  let annotated = 0;

  for (const field of Object.values(FIELD_REGISTRY)) {
    const node = nodeAtPath(schema, field.path);
    if (!node) {
      missing.push(field.path);
      continue;
    }

    node.title = field.label;
    node["x-fc"] = {
      path: field.path,
      fourCornersPath: field.fourCornersPath,
      ...(field.uiSection ? { uiSection: field.uiSection } : {}),
      ...(field.canvasCorner ? { canvasCorner: field.canvasCorner } : {}),
      required: field.required ?? false,
      ...(field.iiif
        ? { iiif: { label: field.iiif.label, section: field.iiif.section } }
        : {}),
    };
    annotated += 1;
  }

  return { annotated, missing };
}

const project = convert(
  FourCornersMetadataExtendedSchema,
  PROJECT_ID,
  "Four Corners project metadata",
);
const { annotated, missing } = annotate(project);

const bundle = convert(ExportEnvelopeSchema, BUNDLE_ID, "Four Corners export bundle");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "project.schema.json"), `${JSON.stringify(project, null, 2)}\n`);
writeFileSync(join(OUT_DIR, "export-bundle.schema.json"), `${JSON.stringify(bundle, null, 2)}\n`);

console.log("generate-schema: wrote schema/project.schema.json, schema/export-bundle.schema.json");
console.log(`  annotated ${annotated} registry fields`);
if (missing.length > 0) {
  console.log(`  registry paths not found in the schema: ${missing.join(", ")}`);
}
