import { toFourCornersSchema } from "./schema";
import type { FourCornersMetadataExtended } from "./schema";
import { escapeHtml } from "./export/escape";

export interface ExportHtmlOptions {
  mode: "snippet" | "standalone";
  imageSource: "embed" | "url";
  imageUrl?: string;
  includeRawMetadata?: boolean;
}

function generateSnippet(
  imgSrc: string,
  json: string,
  id: string,
  caption: string
): string {
  return `<!-- Four Corners Image: ${escapeHtml(caption)} -->
<div class="fc-embed" style="max-width:800px;">
  <img src="${imgSrc}" alt="${escapeHtml(
    caption
  )}" data-4c="${id}" style="width:100%;height:auto;">
</div>
<script data-4c-meta="${id}" type="application/json">
${json}
</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/four-corners/fourcorners.js@main/dist/fourcorners.min.css">
<script src="https://cdn.jsdelivr.net/gh/four-corners/fourcorners.js@main/dist/fourcorners.min.js" defer></script>
<script>document.addEventListener('DOMContentLoaded',()=>new FourCorners('[data-4c="${id}"]',{caption:true,credit:true}));</script>
<!-- End Four Corners -->`;
}

function generateStandalone(
  imgSrc: string,
  json: string,
  caption: string,
  includeRawMetadata: boolean = true
): string {
  const prettyJson = JSON.stringify(JSON.parse(json), null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(caption)} — Four Corners</title>
  
  <!-- Four Corners Viewer -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/four-corners/fourcorners.js@main/dist/fourcorners.min.css">
  
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: system-ui, -apple-system, sans-serif;
      background: #111;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
    }
    .fc-wrapper {
      max-width: 1000px;
      width: 100%;
    }
    .fc-wrapper img {
      width: 100%;
      height: auto;
      display: block;
    }
    .fc-meta {
      margin-top: 2rem;
      padding: 1rem;
      background: #1a1a1a;
      border-radius: 8px;
      font-size: 0.875rem;
      max-width: 1000px;
      width: 100%;
    }
    .fc-meta summary {
      cursor: pointer;
      color: #888;
      user-select: none;
    }
    .fc-meta summary:hover {
      color: #aaa;
    }
    .fc-meta pre {
      margin-top: 1rem;
      overflow-x: auto;
      color: #aaa;
      font-size: 0.75rem;
      line-height: 1.5;
    }
    .fc-footer {
      margin-top: 2rem;
      font-size: 0.75rem;
      color: #666;
      text-align: center;
    }
    .fc-footer a { 
      color: #888;
      text-decoration: none;
    }
    .fc-footer a:hover {
      color: #aaa;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="fc-wrapper">
    <img 
      src="${imgSrc}" 
      alt="${escapeHtml(caption)}"
      data-4c="image"
    />
  </div>
  
  ${
    includeRawMetadata
      ? `<!-- Expandable raw metadata for transparency -->
  <details class="fc-meta">
    <summary>View image metadata (JSON)</summary>
    <pre>${escapeHtml(prettyJson)}</pre>
  </details>`
      : ""
  }
  
  <footer class="fc-footer">
    Created with <a href="https://four-corners.thetechmargin.com" target="_blank">Four Corners Metadata Editor</a>
    · <a href="https://fourcornersproject.org" target="_blank">Four Corners Project</a>
  </footer>

  <!-- Metadata -->
  <script data-4c-meta="image" type="application/json">
${json}
  </script>
  
  <!-- Four Corners Viewer -->
  <script src="https://cdn.jsdelivr.net/gh/four-corners/fourcorners.js@main/dist/fourcorners.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      new FourCorners('[data-4c="image"]', {
        caption: true,
        credit: true,
        logo: true,
        dark: true
      });
    });
  </script>
</body>
</html>`;
}

export function generateHtmlExport(
  state: FourCornersMetadataExtended,
  imageDataUrl: string,
  options: ExportHtmlOptions
): string {
  const schema = toFourCornersSchema(state);
  const jsonString = JSON.stringify(schema, null, 2);
  const uniqueId = `fc-${Date.now()}`;
  const caption = state.creativeCommons?.description || "Untitled";

  // Determine image source
  const imgSrc =
    options.imageSource === "embed"
      ? imageDataUrl
      : options.imageUrl || "[YOUR_IMAGE_URL]";

  if (options.mode === "snippet") {
    return generateSnippet(imgSrc, jsonString, uniqueId, caption);
  } else {
    return generateStandalone(
      imgSrc,
      jsonString,
      caption,
      options.includeRawMetadata ?? true
    );
  }
}

export function getImageSizeEstimate(dataUrl: string): number {
  // Base64 is roughly 4/3 the size of the original
  // Remove data URL prefix to get actual base64 length
  const base64Length = dataUrl.replace(/^data:image\/\w+;base64,/, "").length;
  return Math.round((base64Length * 3) / 4);
}
