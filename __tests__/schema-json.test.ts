/**
 * The committed JSON Schemas must match what the generator produces from the
 * Zod model, so a model change cannot ship without the schema that describes
 * it. Run `npm run generate:schema` when this fails.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (name: string) =>
  JSON.parse(readFileSync(join(ROOT, "schema", name), "utf8"));

describe("generated JSON Schemas", () => {
  const project = read("project.schema.json");
  const bundle = read("export-bundle.schema.json");

  it("describe the four corners at the document root", () => {
    expect(Object.keys(project.properties)).toEqual(
      expect.arrayContaining(["backStory", "context", "links", "creativeCommons"]),
    );
    expect(Object.keys(bundle.properties)).toEqual(
      expect.arrayContaining(["backStory", "context", "links", "creativeCommons", "_ext"]),
    );
  });

  it("identify themselves with a resolvable-free URN and a version", () => {
    expect(project.$id).toMatch(/^urn:four-corners:project:\d+\.\d+\.\d+$/);
    expect(bundle.$id).toMatch(/^urn:four-corners:export-bundle:\d+\.\d+\.\d+$/);
  });

  it("carry the registry's labels and IIIF mapping", () => {
    const author = project.properties.backStory.properties.author;
    expect(author.title).toBe("Photographer Name");
    expect(author["x-fc"].iiif.label).toBe("Creator");
  });

  it("type coordinates as numbers rather than an opaque effect", () => {
    expect(project.properties.location.properties.latitude.type).toEqual([
      "number",
      "null",
    ]);
  });

  it("are up to date with the Zod model", () => {
    execFileSync("npx", ["tsx", "scripts/generate-schema.ts"], { cwd: ROOT, stdio: "pipe" });
    expect(read("project.schema.json")).toEqual(project);
    expect(read("export-bundle.schema.json")).toEqual(bundle);
  });
});
