/**
 * ZIP bundle assembly — pure (prepared content in, Blob out) so tests can
 * drive real bundles through the import path. Assets are paired by refId via
 * their AssetRef zipPath (never by array index). Already-compressed media is
 * STOREd; text entries deflate.
 */

import JSZip from "jszip";
import type { AssetRef } from "./types";

export interface ZipBundleContent {
  assets: AssetRef[];
  metadataJson: string;
  iiifManifestJson: string;
  indexHtml: string;
  standaloneHtml?: string;
  readme: string;
}

export async function buildZipBundle(
  content: ZipBundleContent,
): Promise<Blob> {
  const zip = new JSZip();

  for (const asset of content.assets) {
    if (asset.status !== "resolved" || !asset.bytes || !asset.zipPath) continue;
    // ArrayBuffer input — JSZip's Blob handling is browser-only, and this
    // module also runs under Node in tests. Media formats are already
    // compressed — deflating them burns CPU for ~0% gain on large files.
    zip.file(asset.zipPath, await asset.bytes.arrayBuffer(), {
      compression: "STORE",
    });
  }

  zip.file("metadata.json", content.metadataJson);
  zip.file("manifest.json", content.iiifManifestJson);
  zip.file("index.html", content.indexHtml);
  if (content.standaloneHtml) {
    zip.file("standalone.html", content.standaloneHtml);
  }
  zip.file("README.txt", content.readme);

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
