/**
 * README.txt for ZIP bundles — ported from lib/exportZip.ts, extended with
 * voice-recording and consent-document sections and driven by the resolved
 * asset list instead of hardcoded arrays.
 */

import type { FourCornersMetadataExtended } from "../field-registry";
import type { AssetRef } from "./types";
import { GENERATOR } from "../attribution";

function countByKind(assets: AssetRef[], kind: AssetRef["kind"]): number {
  return assets.filter((a) => a.kind === kind && a.status === "resolved").length;
}

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function buildReadme(
  metadata: FourCornersMetadataExtended,
  assets: AssetRef[],
  includesStandalone: boolean,
): string {
  const caption = metadata.creativeCommons?.description || "Untitled";
  const photographer = metadata.creativeCommons?.copyright || "";
  const mainImage = assets.find(
    (a) => a.kind === "main-image" && a.status === "resolved",
  );
  const mediaCount = countByKind(assets, "context-media");
  const contextAudioCount = countByKind(assets, "context-audio");
  const voiceCount = countByKind(assets, "voice-audio");
  const docsCount = countByKind(assets, "consent-doc");

  let text = `FOUR CORNERS EXPORT
==================

Image: ${caption}
${photographer ? `Photographer: ${photographer}\n` : ""}
Files included:
--------------
index.html        : Open in browser to view
${mainImage ? `${mainImage.filename.padEnd(18)}: Primary photograph\n` : ""}`;

  if (mediaCount > 0) {
    text += `media/            : Related context media (${plural(mediaCount, "file")})\n`;
  }
  if (contextAudioCount > 0) {
    text += `audio/            : Context audio annotations (${plural(contextAudioCount, "file")})\n`;
  }
  if (voiceCount > 0) {
    text += `voice/            : Voice recordings with transcripts (${plural(voiceCount, "file")})\n`;
  }
  if (docsCount > 0) {
    text += `docs/             : Consent documentation (${plural(docsCount, "file")})\n`;
  }

  text += `metadata.json     : Full metadata for 1:1 reimport
manifest.json     : IIIF Presentation 3.0 manifest
${includesStandalone ? "standalone.html   : Single-file viewer (all assets embedded)\n" : ""}
Viewing:
-------
index.html references the asset files in this folder — keep the folder
structure intact.${
    includesStandalone
      ? `
standalone.html embeds everything as base64 — a single file that works
anywhere, ~33% larger than the raw assets.`
      : ""
  }

Reimporting:
-----------
Import this entire ZIP (or metadata.json alone) into any Four Corners
editor — all fields, media, audio, and voice recordings are restored 1:1.

To publish:
----------
Upload the folder contents to your web server, maintaining the folder
structure, then navigate to index.html.

IIIF Manifest:
-------------
manifest.json is a IIIF Presentation API 3.0 manifest. Load it into any
IIIF viewer:
- Mirador: https://projectmirador.org
- Universal Viewer: https://universalviewer.io
- Clover: https://samvera-labs.github.io/clover-iiif/

The manifest references the image via relative path. For remote IIIF
viewers, host all files on a web server and update the manifest "id" and
image URLs accordingly.

Validate at: https://presentation-validator.iiif.io/

About Four Corners:
------------------
Four Corners is a journalism standard for transparency in photojournalism,
providing context about:
- How the photograph was made (backstory)
- Related imagery (context)
- Further reading (links)
- Copyright and credit information

Learn more: https://fourcornersproject.org

${GENERATOR}
`;

  return text;
}
