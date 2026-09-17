/**
 * Self-contained Four Corners HTML viewer — full-registry edition.
 *
 * Replaces lib/exportSelfContained.ts. Renders EVERY populated field:
 * registry-driven scalar sections (backStory, creativeCommons, ethics with
 * badges + detail texts, photographerInfo, location, photoMetadata camera
 * block) plus the array sections (context media/video/audio with
 * caption/credit/description/date, voice players + transcripts, links).
 *
 * The `#fc-metadata` script embeds the CANONICAL export JSON — not raw
 * state — so any exported HTML is itself importable 1:1.
 *
 * Worker/Node-safe: pure string generation, no DOM.
 */

import { FIELD_REGISTRY } from "../field-registry";
import type { FourCornersMetadataExtended } from "../field-registry";
import { getValueByPath, hasValue } from "../field-utils";
import { escapeHtml } from "./escape";

/** Envelope produced by buildExportMetadata (root + _ext). */
export interface ExportEnvelope {
  backStory: FourCornersMetadataExtended["backStory"];
  context: Array<Record<string, unknown>>;
  links: FourCornersMetadataExtended["links"];
  creativeCommons: FourCornersMetadataExtended["creativeCommons"];
  _ext: {
    ethics?: FourCornersMetadataExtended["ethics"];
    photographerInfo?: FourCornersMetadataExtended["photographerInfo"];
    location?: FourCornersMetadataExtended["location"];
    photoMetadata?: FourCornersMetadataExtended["photoMetadata"];
    voiceTranscriptions?: Array<Record<string, unknown>>;
    meta?: FourCornersMetadataExtended["meta"];
    mainImage?: string;
    consentDocuments?: Array<{ name: string; type?: string; size?: number }>;
    [key: string]: unknown;
  };
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Registry-driven label/value rows for every populated field under a path
 *  prefix. New registry fields appear in exports automatically. */
function renderRegistryRows(
  data: Record<string, unknown>,
  prefix: string,
  skip: Set<string> = new Set(),
): string {
  let html = "";
  for (const field of Object.values(FIELD_REGISTRY)) {
    if (!field.path.startsWith(`${prefix}.`)) continue;
    if (skip.has(field.path)) continue;
    if (field.fieldType === "boolean") continue; // rendered as badges
    const value = getValueByPath(data, field.path);
    if (!hasValue(value)) continue;
    html += `<div class="field-row"><span class="field-label">${escapeHtml(
      field.label,
    )}</span><span class="field-value">${escapeHtml(str(value))}</span></div>`;
  }
  return html;
}

function renderEthicsBadges(
  ethics: NonNullable<FourCornersMetadataExtended["ethics"]>,
): string {
  const badges: string[] = [];
  for (const field of Object.values(FIELD_REGISTRY)) {
    if (!field.path.startsWith("ethics.") || field.fieldType !== "boolean")
      continue;
    const key = field.path.split(".")[1] as keyof typeof ethics;
    if (ethics[key] === true) {
      badges.push(`<span class="badge">${escapeHtml(field.label)}</span>`);
    }
  }
  return badges.length > 0
    ? `<div class="ethics-badges">${badges.join("")}</div>`
    : "";
}

function mediaSrc(item: Record<string, unknown>): string {
  return str(item.src || item.url);
}

function audioSrc(item: Record<string, unknown>): string {
  return str(item.audioDataUrl || item.audioStorageUrl);
}

// ── Panels ──────────────────────────────────────────────────────────────────

function generateCreditPanel(env: ExportEnvelope): string {
  const { creativeCommons } = env;
  const { ethics, photographerInfo, consentDocuments } = env._ext;
  const data = { creativeCommons, photographerInfo } as Record<string, unknown>;

  let html = '<div class="panel-section">';
  if (creativeCommons?.description) {
    html += `<div class="caption">${escapeHtml(creativeCommons.description)}</div>`;
  }
  if (creativeCommons?.copyright) {
    html += `<div class="copyright">© ${escapeHtml(creativeCommons.copyright)}</div>`;
  }

  const photographerRows = renderRegistryRows(data, "photographerInfo");
  if (photographerRows) {
    html += `<div class="field-group"><div class="field-group-title">Photographer</div>${photographerRows}</div>`;
  }

  if (ethics) {
    html += renderEthicsBadges(ethics);
    const detailRows = renderRegistryRows(
      { ethics } as Record<string, unknown>,
      "ethics",
    );
    if (detailRows) {
      html += `<div class="field-group"><div class="field-group-title">Code of Ethics</div>${detailRows}</div>`;
    }
  }

  if (consentDocuments && consentDocuments.length > 0) {
    html += `<div class="field-group"><div class="field-group-title">Consent Documentation</div>`;
    for (const doc of consentDocuments) {
      html += `<div class="field-row"><span class="field-value">${escapeHtml(doc.name)}</span></div>`;
    }
    html += "</div>";
  }

  html += "</div>";
  return html;
}

function generateBackstoryPanel(env: ExportEnvelope): string {
  const { backStory } = env;
  const { location, photoMetadata, voiceTranscriptions } = env._ext;

  let html = '<div class="panel-section">';

  if (backStory?.text) {
    html += `<div class="backstory-text">${escapeHtml(backStory.text)}</div>`;
  }
  if (backStory?.author || backStory?.publication || backStory?.date) {
    html += '<div class="attribution">';
    if (backStory.author)
      html += `<div class="author">${escapeHtml(backStory.author)}</div>`;
    if (backStory.publication) {
      const pub = escapeHtml(backStory.publication);
      html += backStory.publicationUrl
        ? `<div class="publication"><a href="${escapeHtml(backStory.publicationUrl)}" target="_blank" rel="noopener noreferrer">${pub}</a></div>`
        : `<div class="publication">${pub}</div>`;
    }
    if (backStory.date)
      html += `<div class="date">${escapeHtml(backStory.date)}</div>`;
    html += "</div>";
  }

  if (voiceTranscriptions && voiceTranscriptions.length > 0) {
    html += `<div class="field-group"><div class="field-group-title">Voice Notes</div>`;
    for (const vt of voiceTranscriptions) {
      html += '<div class="voice-note">';
      const src = audioSrc(vt);
      if (src) {
        html += `<audio controls preload="none" src="${escapeHtml(src)}"></audio>`;
      }
      if (vt.text) {
        html += `<div class="voice-transcript">${escapeHtml(str(vt.text))}</div>`;
      }
      html += "</div>";
    }
    html += "</div>";
  }

  if (
    location &&
    (hasValue(location.latitude) ||
      hasValue(location.formattedLocation) ||
      hasValue(location.city))
  ) {
    html += '<div class="location">';
    html += `<div class="location-title">📍 Location</div>`;
    if (hasValue(location.latitude) && hasValue(location.longitude)) {
      html += `<div class="coordinates">${location.latitude}, ${location.longitude}</div>`;
    }
    if (location.formattedLocation) {
      html += `<div class="location-desc">${escapeHtml(location.formattedLocation)}</div>`;
    }
    if (location.address) {
      const parts = [
        location.address.street,
        location.address.street2,
        location.address.city,
        location.address.district,
        location.address.stateProvince,
        location.address.postalCode,
        location.address.country,
      ].filter((p): p is string => !!p);
      if (parts.length > 0) {
        html += `<div class="location-desc">${escapeHtml(parts.join(", "))}</div>`;
      }
    }
    if (location.capturedAt) {
      html += `<div class="location-desc">Captured: ${escapeHtml(location.capturedAt)}</div>`;
    }
    html += "</div>";
  }

  if (photoMetadata) {
    const cameraRows = renderRegistryRows(
      { photoMetadata } as Record<string, unknown>,
      "photoMetadata",
    );
    if (cameraRows || photoMetadata.dateTaken) {
      html += `<div class="field-group"><div class="field-group-title">Camera</div>`;
      if (photoMetadata.dateTaken) {
        html += `<div class="field-row"><span class="field-label">Date Taken</span><span class="field-value">${escapeHtml(str(photoMetadata.dateTaken))}</span></div>`;
      }
      html += `${cameraRows}</div>`;
    }
  }

  html += "</div>";
  return html;
}

function generateContextPanel(env: ExportEnvelope): string {
  const { context } = env;

  let html = '<div class="panel-section">';
  if (context && context.length > 0) {
    html += '<div class="context-items">';
    for (const item of context) {
      html += '<div class="context-item">';
      const src = mediaSrc(item);
      if (src) {
        if (item.type === "video") {
          html += `<video controls preload="metadata" src="${escapeHtml(src)}"></video>`;
        } else {
          html += `<img src="${escapeHtml(src)}" alt="${escapeHtml(str(item.caption))}" loading="lazy" />`;
        }
      }
      const audio = audioSrc(item);
      if (audio) {
        html += `<div class="context-audio"><audio controls preload="none" src="${escapeHtml(audio)}"></audio></div>`;
      }
      if (item.caption) {
        html += `<div class="context-caption">${escapeHtml(str(item.caption))}</div>`;
      }
      if (item.description) {
        html += `<div class="context-detail">${escapeHtml(str(item.description))}</div>`;
      }
      const creditDate = [
        item.credit ? `Credit: ${str(item.credit)}` : "",
        item.date ? str(item.date) : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (creditDate) {
        html += `<div class="context-meta">${escapeHtml(creditDate)}</div>`;
      }
      if (item.linkedProjectSlug || item.linkedProjectId) {
        html += `<div class="context-meta">Linked Four Corners project: ${escapeHtml(str(item.linkedProjectSlug || item.linkedProjectId))}</div>`;
      }
      if (item.sourceType === "url" && item.url && !str(item.url).startsWith("data:") && !str(item.url).startsWith("./")) {
        html += `<div class="context-meta"><a href="${escapeHtml(str(item.url))}" target="_blank" rel="noopener noreferrer">View source</a></div>`;
      }
      html += "</div>";
    }
    html += "</div>";
  } else {
    html += '<div class="empty-state">No related imagery</div>';
  }
  html += "</div>";
  return html;
}

function generateLinksPanel(env: ExportEnvelope): string {
  const { links } = env;

  let html = '<div class="panel-section">';
  if (links && links.length > 0) {
    html += '<div class="links-list">';
    for (const link of links) {
      html += '<div class="link-item">';
      html += `<a href="${escapeHtml(link.url || "")}" target="_blank" rel="noopener noreferrer">`;
      html += `<div class="link-title">${escapeHtml(link.title || link.url || "")}</div>`;
      if (link.source) {
        html += `<div class="link-source">${escapeHtml(link.source)}</div>`;
      }
      html += "</a></div>";
    }
    html += "</div>";
  } else {
    html += '<div class="empty-state">No links available</div>';
  }
  html += "</div>";
  return html;
}

// ── Content presence (drives corner enable/disable) ─────────────────────────

function hasCreditContent(env: ExportEnvelope): boolean {
  return !!(
    env.creativeCommons?.copyright ||
    env.creativeCommons?.description ||
    env._ext.photographerInfo?.bio ||
    env._ext.ethics
  );
}

function hasBackstoryContent(env: ExportEnvelope): boolean {
  return !!(
    env.backStory?.text ||
    env._ext.location?.latitude ||
    env._ext.photoMetadata ||
    (env._ext.voiceTranscriptions?.length ?? 0) > 0
  );
}

// ── Document shell ──────────────────────────────────────────────────────────

const VIEWER_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a; color: #fff; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 2rem;
    }
    .fc-container { position: relative; max-width: 1200px; width: 100%; }
    .fc-image-wrapper { position: relative; width: 100%; }
    .fc-image { width: 100%; height: auto; display: block; border-radius: 4px; }
    .fc-corner { position: absolute; width: 60px; height: 60px; cursor: pointer; transition: all 0.2s; z-index: 10; }
    .fc-corner:hover:not(.empty) { transform: scale(1.1); }
    .fc-corner.empty { opacity: 0.3; cursor: default; }
    .fc-corner svg { width: 100%; height: 100%; }
    .fc-corner-br { bottom: 10px; right: 10px; }
    .fc-corner-br svg { stroke: #ff6b35; }
    .fc-corner-bl { bottom: 10px; left: 10px; }
    .fc-corner-bl svg { stroke: #09fff0; }
    .fc-corner-tl { top: 10px; left: 10px; }
    .fc-corner-tl svg { stroke: #b968ff; }
    .fc-corner-tr { top: 10px; right: 10px; }
    .fc-corner-tr svg { stroke: #00ff88; }
    .fc-panel {
      position: fixed; top: 0; right: -400px; width: 400px; max-width: 90vw; height: 100vh;
      background: #1a1a1a; border-left: 1px solid #333; padding: 2rem; overflow-y: auto;
      transition: right 0.3s ease; z-index: 1000;
    }
    .fc-panel.open { right: 0; }
    .fc-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #333; }
    .fc-panel-title { font-size: 1.125rem; font-weight: 600; color: #fff; }
    .fc-panel-close { background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
    .fc-panel-close:hover { background: #333; color: #fff; }
    .panel-section { font-size: 0.9375rem; line-height: 1.6; color: #ccc; }
    .caption { font-size: 1rem; margin-bottom: 0.75rem; color: #fff; }
    .copyright { font-size: 0.875rem; color: #888; margin-bottom: 1rem; }
    .field-group { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #333; }
    .field-group-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #777; margin-bottom: 0.5rem; }
    .field-row { display: flex; gap: 0.75rem; font-size: 0.875rem; margin-top: 0.375rem; }
    .field-label { color: #888; flex: 0 0 auto; min-width: 7rem; }
    .field-value { color: #ddd; word-break: break-word; }
    .field-value a, .publication a { color: #09fff0; }
    .ethics-badges { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; background: #333; border-radius: 999px; font-size: 0.75rem; color: #09fff0; border: 1px solid #09fff0; }
    .backstory-text { margin-bottom: 1rem; white-space: pre-wrap; }
    .attribution { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #333; font-size: 0.875rem; }
    .author { font-weight: 600; color: #fff; }
    .publication, .date { color: #888; margin-top: 0.25rem; }
    .voice-note { margin-top: 0.75rem; padding: 0.75rem; background: #222; border-radius: 8px; }
    .voice-note audio, .context-audio audio { width: 100%; margin-bottom: 0.5rem; }
    .voice-transcript { font-size: 0.875rem; color: #aaa; white-space: pre-wrap; }
    .location { margin-top: 1.5rem; padding: 1rem; background: #222; border-radius: 8px; }
    .location-title { font-weight: 600; margin-bottom: 0.5rem; }
    .coordinates { font-family: monospace; color: #09fff0; font-size: 0.875rem; }
    .location-desc { margin-top: 0.5rem; font-size: 0.875rem; color: #aaa; }
    .context-items { display: grid; gap: 1rem; }
    .context-item { background: #222; border-radius: 8px; overflow: hidden; }
    .context-item img, .context-item video { width: 100%; height: auto; display: block; }
    .context-audio { padding: 0.75rem 0.75rem 0; }
    .context-caption { padding: 0.75rem 0.75rem 0.25rem; font-size: 0.875rem; color: #ddd; }
    .context-detail { padding: 0 0.75rem 0.25rem; font-size: 0.8125rem; color: #999; }
    .context-meta { padding: 0 0.75rem 0.5rem; font-size: 0.75rem; color: #777; }
    .context-meta a { color: #09fff0; }
    .links-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .link-item { background: #222; border-radius: 8px; }
    .link-item:hover { background: #2a2a2a; }
    .link-item a { display: block; padding: 1rem; text-decoration: none; color: inherit; }
    .link-title { font-weight: 500; color: #fff; margin-bottom: 0.25rem; }
    .link-source { font-size: 0.75rem; color: #888; }
    .empty-state { text-align: center; padding: 2rem; color: #666; font-size: 0.875rem; }
    .fc-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); opacity: 0; visibility: hidden; transition: all 0.3s; z-index: 999; }
    .fc-overlay.visible { opacity: 1; visibility: visible; }
    @media (max-width: 768px) {
      body { padding: 1rem; }
      .fc-corner { width: 48px; height: 48px; }
      .fc-panel { width: 100%; }
    }
    @media (prefers-color-scheme: light) {
      body { background: #f5f5f5; color: #111; }
      .fc-panel { background: #fff; border-left-color: #ddd; }
      .fc-panel-header { border-bottom-color: #ddd; }
      .fc-panel-title { color: #111; }
      .panel-section { color: #444; }
      .caption, .author, .link-title, .context-caption { color: #111; }
      .field-value { color: #333; }
      .badge { background: #f0f0f0; color: #09a896; border-color: #09a896; }
      .field-group, .attribution { border-top-color: #ddd; }
      .location, .context-item, .link-item, .voice-note { background: #f8f8f8; }
      .coordinates, .field-value a, .context-meta a, .publication a { color: #09a896; }
    }
`;

const VIEWER_SCRIPT = `
    (function() {
      const overlay = document.getElementById('overlay');
      const panels = {
        credit: document.getElementById('panel-credit'),
        backstory: document.getElementById('panel-backstory'),
        context: document.getElementById('panel-context'),
        links: document.getElementById('panel-links')
      };
      let currentPanel = null;
      function openPanel(name) {
        closePanel();
        currentPanel = name;
        panels[name].classList.add('open');
        overlay.classList.add('visible');
      }
      function closePanel() {
        if (currentPanel) {
          panels[currentPanel].classList.remove('open');
          currentPanel = null;
        }
        overlay.classList.remove('visible');
      }
      document.querySelectorAll('.fc-corner').forEach(corner => {
        corner.addEventListener('click', function() {
          if (!this.classList.contains('empty')) openPanel(this.dataset.corner);
        });
      });
      document.querySelectorAll('.fc-panel-close').forEach(btn => btn.addEventListener('click', closePanel));
      overlay.addEventListener('click', closePanel);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closePanel(); });
    })();
`;

/**
 * Render the viewer document around an export envelope.
 * `mainImageSrc` overrides `_ext.mainImage` (index.html passes the
 * bundle-relative path; standalone passes the embedded data URL).
 */
export function buildViewerHtml(
  envelope: ExportEnvelope,
  mainImageSrc?: string,
): string {
  const caption = envelope.creativeCommons?.description || "Four Corners Image";
  const imageSrc = mainImageSrc ?? envelope._ext.mainImage ?? "";
  // Guard against "</script>" inside metadata strings terminating the block.
  const metadataJson = JSON.stringify(envelope, null, 2).replace(
    /<\//g,
    "<\\/",
  );

  const hasCredit = hasCreditContent(envelope);
  const hasBackstory = hasBackstoryContent(envelope);
  const hasContext = (envelope.context?.length || 0) > 0;
  const hasLinks = (envelope.links?.length || 0) > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(caption)}</title>
  <style>${VIEWER_CSS}</style>
</head>
<body>
  <div class="fc-container">
    <div class="fc-image-wrapper">
      <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(caption)}" class="fc-image">
      <div class="fc-corner fc-corner-br ${hasCredit ? "" : "empty"}" data-corner="credit">
        <svg viewBox="0 0 60 60" fill="none" stroke-width="3">
          <path d="M 50,60 L 60,60 L 60,50" />
          <path d="M 10,60 L 0,60 L 0,50" />
        </svg>
      </div>
      <div class="fc-corner fc-corner-bl ${hasBackstory ? "" : "empty"}" data-corner="backstory">
        <svg viewBox="0 0 60 60" fill="none" stroke-width="3">
          <path d="M 10,60 L 0,60 L 0,50" />
          <path d="M 10,0 L 0,0 L 0,10" />
        </svg>
      </div>
      <div class="fc-corner fc-corner-tl ${hasContext ? "" : "empty"}" data-corner="context">
        <svg viewBox="0 0 60 60" fill="none" stroke-width="3">
          <path d="M 10,0 L 0,0 L 0,10" />
          <path d="M 50,0 L 60,0 L 60,10" />
        </svg>
      </div>
      <div class="fc-corner fc-corner-tr ${hasLinks ? "" : "empty"}" data-corner="links">
        <svg viewBox="0 0 60 60" fill="none" stroke-width="3">
          <path d="M 50,0 L 60,0 L 60,10" />
          <path d="M 50,60 L 60,60 L 60,50" />
        </svg>
      </div>
    </div>
  </div>
  <div class="fc-overlay" id="overlay"></div>
  <div class="fc-panel" id="panel-credit">
    <div class="fc-panel-header">
      <div class="fc-panel-title">Credit &amp; Ethics</div>
      <button class="fc-panel-close" aria-label="Close">&times;</button>
    </div>
    ${hasCredit ? generateCreditPanel(envelope) : ""}
  </div>
  <div class="fc-panel" id="panel-backstory">
    <div class="fc-panel-header">
      <div class="fc-panel-title">Backstory</div>
      <button class="fc-panel-close" aria-label="Close">&times;</button>
    </div>
    ${hasBackstory ? generateBackstoryPanel(envelope) : ""}
  </div>
  <div class="fc-panel" id="panel-context">
    <div class="fc-panel-header">
      <div class="fc-panel-title">Related Imagery</div>
      <button class="fc-panel-close" aria-label="Close">&times;</button>
    </div>
    ${generateContextPanel(envelope)}
  </div>
  <div class="fc-panel" id="panel-links">
    <div class="fc-panel-header">
      <div class="fc-panel-title">Links &amp; Resources</div>
      <button class="fc-panel-close" aria-label="Close">&times;</button>
    </div>
    ${generateLinksPanel(envelope)}
  </div>
  <script type="application/json" id="fc-metadata">
${metadataJson}
  </script>
  <script>${VIEWER_SCRIPT}</script>
</body>
</html>`;
}

/** Standalone viewer: embedded-flavor envelope, media inlined as data URLs. */
export function buildStandaloneHtml(envelope: ExportEnvelope): string {
  return buildViewerHtml(envelope);
}

/** Bundle viewer: bundle-relative envelope, media via ./ paths. */
export function buildIndexHtml(envelope: ExportEnvelope): string {
  return buildViewerHtml(envelope);
}
