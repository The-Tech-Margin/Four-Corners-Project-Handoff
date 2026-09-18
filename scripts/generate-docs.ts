/* eslint-disable @typescript-eslint/no-explicit-any -- runtime Zod schema introspection */
/**
 * generate-docs.ts — Four Corners documentation generator.
 *
 * SINGLE SOURCE OF TRUTH for the in-app docs (/docs) and the standalone PDFs.
 * Reads the field registry + OpenAPI spec (the same source of truth the app
 * itself uses) and merges them with the editorial copy in EDITORIAL below.
 *
 * Outputs (all additive, generated — do not hand-edit):
 *   app/docs/_data/docsData.ts    — typed module consumed by the /docs pages
 *   app/docs/_data/docsData.json  — same data for the PDF renderer / tooling
 *
 * Run:  npm run generate:docs
 * (mirrors the existing `npm run generate:types` convention)
 *
 * When fields change in lib/field-registry.ts or endpoints change in
 * lib/openapi-spec.ts, re-run this script and the docs update automatically.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIELD_REGISTRY,
  ContextItemSchema,
  LinkSchema,
  VoiceTranscriptionSchema,
} from "../lib/field-registry";
import { buildOpenAPISpec } from "../lib/openapi-spec";
import { GENERATOR, siteUrl } from "../lib/attribution";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "app/docs/_data");

// Deterministic "source as of" date: the most recent commit touching either data
// source. Keeps generate:docs reproducible (no wall-clock) so the CI freshness
// check — `git diff --exit-code app/docs/_data` — only trips on real content drift.
function sourceDate(): string {
  const FALLBACK = "2026-05-16";
  const files = ["lib/field-registry.ts", "lib/openapi-spec.ts"];
  const dates = files
    .map((f) => {
      try {
        return execFileSync("git", ["log", "-1", "--date=short", "--format=%cd", "--", f], {
          cwd: ROOT,
          encoding: "utf8",
        }).trim();
      } catch {
        return "";
      }
    })
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return dates.length ? dates.sort().at(-1)! : FALLBACK;
}

// ─────────────────────────────────────────────────────────────────────────
// EDITORIAL — the only hand-written content. Safe to edit; everything else is
// extracted from source. Voice + framing drawn from the Four Corners protocol.
// ─────────────────────────────────────────────────────────────────────────
const EDITORIAL = {
  tagline:
    "An open standard for how images carry their story — shifting photographers into authors, and viewers into engaged readers.",
  gettingStarted: [
    { n: 1, title: "Get an account", body: "Create an account from the sign-in dialog, or ask whoever runs this deployment for access." },
    { n: 2, title: "Sign in", body: "Sign in with your email and password. Forgotten passwords are reset by email link." },
    { n: 3, title: "Land in the editor", body: "The editor is your home page after logging in — it's where you build a project." },
    { n: 4, title: "Upload an image or video", body: "Drop a file, upload, or pick from your library. The corner icons on the preview jump you to each section." },
    { n: 5, title: "Fill your corners", body: "Add as much or as little as you like across one or more corners — there is no minimum." },
    { n: 6, title: "Save & name", body: "Save your project and give it a name; a shareable URL slug is derived automatically." },
    { n: 7, title: "Preview & publish", body: "Preview the gallery view, then publish to the public gallery when you're ready." },
    { n: 8, title: "View & share", body: "View your work in the gallery and share it via its URL or the share link in the gallery list." },
  ],
  corners: {
    context: {
      whatItHolds: "Companion photographs, sequences, diptychs, archival images, and related visual material attached directly to the project.",
      whyItMatters: "A single frame can mislead; related imagery shows what surrounds the decisive moment — from one companion shot to a decade-spanning archive.",
    },
    links: {
      whatItHolds: "Curated links to articles, investigations, data reports, and institutional sources that explain why the image matters.",
      whyItMatters: "Connects the photograph to verifiable sources and ongoing accountability journalism — a living bibliography that grows with the story.",
    },
    backstory: {
      whatItHolds: "The photographer's first-person narrative — written or voice — about the circumstances of capture, the relationship to the subject, and the intent behind the frame.",
      whyItMatters: "Transparency about how and why an image was made is central to trusting it. Voice notes with Whisper transcription work in the field and at the desk.",
    },
    authorship: {
      whatItHolds: "Author bio, credit and license, collaborators, code-of-ethics declaration, software/staging disclosure, and informed-consent type.",
      whyItMatters: "Tells viewers and re-users what is permitted, who consented, and what is responsible — embedded permanently in the image record.",
    },
  } as Record<string, { whatItHolds: string; whyItMatters: string }>,
  crossCutting: {
    location: "Where the photograph was taken (not where metadata is entered). Auto-filled from EXIF GPS, captured from the device, or entered manually — and can be excluded from export.",
    "camera-metadata": "Camera, lens, exposure, GPS and timestamps extracted from the image file on upload — no manual entry under deadline pressure.",
    voice: "Browser audio recording transcribed via Whisper, woven into nearly every text field. Available to anonymous users at a shorter limit, so testimony can be captured without an account.",
  } as Record<string, string>,
  visibility: [
    { state: "Draft / Private", published: false, inGallery: false, meaning: "Only you can see it. Work in progress." },
    { state: "Shared via link", published: true, inGallery: false, meaning: "Anyone with the share link can view; not listed in the public gallery." },
    { state: "Public gallery", published: true, inGallery: true, meaning: "Published and discoverable in the public gallery." },
  ],
  // Accessibility guide — user-facing, hand-written. Renders at /docs/accessibility.
  // Keep it plain-language; the technical reference lives in ACCESSIBILITY.md.
  accessibility: [
    {
      id: "keyboard",
      title: "Keyboard basics (everywhere)",
      items: [
        "Tab and Shift+Tab move between controls; Enter or Space activates buttons and links.",
        "Escape closes any open menu, dropdown, dialog, viewer panel, or overlay.",
        "A “Skip to main content” link is the first thing Tab reaches on every page.",
        "Once the app menu is open, the arrow keys move between its items and Escape returns focus to the menu button.",
      ],
    },
    {
      id: "editor",
      title: "In the editor (signed in)",
      items: [
        "Cmd+S (Mac) / Ctrl+S exports your metadata as JSON from anywhere in the editor.",
        "The corner icons on the image preview jump to each of the four sections.",
        "Nearly every text field accepts voice input — recordings are transcribed automatically.",
        "In Sketchboard (canvas) mode: + or = zooms in, − zooms out, 0 fits the content to view, and Escape closes the open panel.",
      ],
    },
    {
      id: "gallery",
      title: "Browsing the gallery (no account needed)",
      items: [
        "Each gallery card is reachable with a single Tab stop via its title — Enter opens the project.",
        "The Sort, tag-filter, and grid/list controls announce their current state to screen readers.",
        "The result count updates as a polite live region, and loading states are announced.",
      ],
    },
    {
      id: "viewer-panels",
      title: "Viewing a published image (no account needed)",
      items: [
        "Each corner on a published image is a button — press Enter or Space to open its panel.",
        "When a panel opens, focus moves into it; press Escape or the close button to dismiss it, and focus returns to the corner you opened.",
        "Related-imagery thumbnails open with Enter or Space, and video players are labelled.",
      ],
    },
    {
      id: "screen-readers",
      title: "Screen reader support",
      items: [
        "Landmarks (banner, main, navigation, content-info) and a skip-to-content link aid orientation.",
        "Icon-only buttons carry text labels; purely decorative graphics are hidden from assistive tech.",
        "Form fields have associated labels and, where helpful, descriptions.",
      ],
    },
    {
      id: "motion-contrast",
      title: "Motion, contrast and focus",
      items: [
        "Animations respect your operating system's “reduce motion” setting.",
        "Text and controls meet WCAG AA contrast in both light and dark themes.",
        "A visible focus outline is shown on every interactive element.",
      ],
    },
    {
      id: "reporting",
      title: "Reporting an accessibility barrier",
      items: [
        "Contact whoever runs this deployment, or open an issue in the project repository.",
        "Say which page you were on, what you were trying to do, and the assistive technology or input method you were using.",
      ],
    },
  ] as { id: string; title: string; items: string[] }[],
};

// ─────────────────────────────────────────────────────────────────────────
// Zod introspection helpers
// ─────────────────────────────────────────────────────────────────────────
function unwrap(s: any): { typeName: string; optional: boolean; values?: string[] } {
  let optional = false;
  let cur = s;
  for (let i = 0; i < 6 && cur?._def; i++) {
    const tn = cur._def.typeName;
    if (tn === "ZodOptional" || tn === "ZodNullable" || tn === "ZodDefault") {
      optional = true;
      cur = cur._def.innerType;
      continue;
    }
    break;
  }
  const def = cur?._def ?? {};
  const typeName = String(def.typeName ?? "Zod").replace(/^Zod/, "").toLowerCase();
  const values = def.typeName === "ZodEnum" ? def.values : undefined;
  return { typeName, optional, values };
}

const prettify = (k: string) =>
  k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/\bUrl\b/, "URL");

function schemaFields(schema: any, only?: string[]) {
  const shape = typeof schema?.shape === "function" ? schema.shape() : schema?.shape;
  if (!shape) return [];
  return Object.entries(shape)
    .filter(([k]) => !only || only.includes(k))
    .map(([key, v]) => {
      const u = unwrap(v);
      return { key, label: prettify(key), required: !u.optional, type: u.typeName, values: u.values };
    });
}

const regAll = Object.values(FIELD_REGISTRY) as any[];
const byUi = (s: string) =>
  regAll
    .filter((f) => f.uiSection === s)
    .map((f) => ({
      key: f.path,
      label: f.label,
      required: !!f.required,
      placeholder: f.canvasPlaceholder ?? undefined,
      iiif: f.iiif?.label ?? undefined,
    }));

// ─────────────────────────────────────────────────────────────────────────
// Assemble
// ─────────────────────────────────────────────────────────────────────────
const corners = [
  {
    key: "context", label: "Context", subtitle: "Related Imagery",
    position: "Upper-Left", glyph: "↖", token: "context",
    ...EDITORIAL.corners.context,
    fields: schemaFields(ContextItemSchema, ["caption", "description", "credit", "date", "type"]),
    note: "A collection — add as many related items as you like; each carries its own caption, credit, date, and optional audio.",
  },
  {
    key: "links", label: "Links", subtitle: "External References",
    position: "Upper-Right", glyph: "↗", token: "links",
    ...EDITORIAL.corners.links,
    fields: schemaFields(LinkSchema),
    note: "A collection of links; Batch mode accepts one URL per line.",
  },
  {
    key: "backstory", label: "Backstory", subtitle: "The Photographer's Voice",
    position: "Lower-Left", glyph: "↙", token: "backstory",
    ...EDITORIAL.corners.backstory,
    fields: byUi("backstory"),
    note: "Every text field supports voice input with Whisper transcription.",
  },
  {
    key: "authorship", label: "Authorship", subtitle: "Ethics & Rights",
    position: "Lower-Right", glyph: "↘", token: "cc",
    ...EDITORIAL.corners.authorship,
    fields: byUi("caption-credit-ethics"),
    note: "Caption, credit & license, photographer bio, software/staging disclosure, and informed consent.",
  },
];

const crossCutting = [
  { key: "location", label: "Geographic Location", note: EDITORIAL.crossCutting.location, fields: byUi("location") },
  { key: "camera-metadata", label: "Camera / EXIF Metadata", note: EDITORIAL.crossCutting["camera-metadata"], fields: byUi("camera-metadata") },
  { key: "voice", label: "Voice Notes & Transcription", note: EDITORIAL.crossCutting.voice, fields: schemaFields(VoiceTranscriptionSchema, ["text", "fieldId"]) },
];

const spec = buildOpenAPISpec(siteUrl()) as any;
const api = Object.entries(spec.paths as Record<string, any>).map(([path, ops]) => {
  const method = Object.keys(ops)[0];
  const op = ops[method];
  return {
    path, method: String(method).toUpperCase(),
    summary: op?.summary ?? "",
    description: String(op?.description ?? "").replace(/\s+/g, " ").trim(),
    tags: (op?.tags ?? []) as string[],
  };
});

const docsData = {
  generatedAt: sourceDate(),
  generator: GENERATOR,
  tagline: EDITORIAL.tagline,
  apiInfo: { title: spec.info.title, version: spec.info.version, baseUrl: siteUrl() },
  gettingStarted: EDITORIAL.gettingStarted,
  corners,
  crossCutting,
  visibility: EDITORIAL.visibility,
  accessibility: EDITORIAL.accessibility,
  api,
};

// ─────────────────────────────────────────────────────────────────────────
// Emit
// ─────────────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });

const banner = `// AUTO-GENERATED by scripts/generate-docs.ts — do not edit by hand.\n// Field data is extracted from lib/field-registry.ts + lib/openapi-spec.ts.\n// Editorial copy lives in scripts/generate-docs.ts (EDITORIAL). Run: npm run generate:docs\n`;

const ts =
  banner +
  `\nexport type DocField = { key: string; label: string; required: boolean; placeholder?: string; type?: string; values?: string[]; iiif?: string };\n` +
  `export type DocCorner = { key: string; label: string; subtitle: string; position: string; glyph: string; token: string; whatItHolds: string; whyItMatters: string; fields: DocField[]; note?: string };\n` +
  `export type DocCross = { key: string; label: string; note: string; fields: DocField[] };\n` +
  `export type DocApi = { path: string; method: string; summary: string; description: string; tags: string[] };\n` +
  `export type DocStep = { n: number; title: string; body: string };\n` +
  `export type DocVisibility = { state: string; published: boolean; inGallery: boolean; meaning: string };\n` +
  `export type DocAccessibility = { id: string; title: string; items: string[] };\n` +
  `export type DocsData = {\n  generatedAt: string;\n  generator: string;\n  tagline: string;\n  apiInfo: { title: string; version: string; baseUrl: string };\n  gettingStarted: DocStep[];\n  corners: DocCorner[];\n  crossCutting: DocCross[];\n  visibility: DocVisibility[];\n  accessibility: DocAccessibility[];\n  api: DocApi[];\n};\n\n` +
  `export const docsData: DocsData = ${JSON.stringify(docsData, null, 2)} as const;\n`;

writeFileSync(join(OUT_DIR, "docsData.ts"), ts);
writeFileSync(join(OUT_DIR, "docsData.json"), JSON.stringify(docsData, null, 2));

console.log(`generate-docs: wrote app/docs/_data/docsData.{ts,json}`);
console.log(`  corners: ${corners.map((c) => `${c.label}(${c.fields.length})`).join(", ")}`);
console.log(`  crossCutting: ${crossCutting.map((c) => `${c.label}(${c.fields.length})`).join(", ")}`);
console.log(`  api paths: ${api.length}`);
