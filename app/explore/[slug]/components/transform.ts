/**
 * Transform a ProjectRecord into a CanvasDocument for the explore view.
 *
 * Reuses the editor's getLayout() grid so explore and edit share
 * the same 2×2 Four Corners layout — photo centered, four corner zones,
 * shapes placed within zones using identical positioning logic.
 */

import type { CanvasDocument, ShapeJSON, ConnectionJSON } from "@fourcorners/canvas";
import type { ProjectRecord } from "@/lib/projects/types";
import { getLayout } from "@/lib/canvas-layout";
import {
  resolveCornerColors,
  CORNER_LABELS,
  CORNER_DESCRIPTIONS,
} from "@/components/sketchboard/shapes/types";

export type LayoutMode = "grid" | "vertical";

// ── helpers ────────────────────────────────────────────────────────────

function connection(fromId: string, toId: string, type = "parent-child"): ConnectionJSON {
  return { id: `conn-${fromId}-${toId}`, fromShapeId: fromId, toShapeId: toId, type };
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "\u2026";
}

/** Whether to skip truncation (set by transformToCanvasDocument for explore view) */
let _fullContent = false;

function textBlock(
  id: string,
  x: number,
  y: number,
  content: string,
  opts: {
    width?: number;
    height?: number;
    fieldMapping?: string;
    cornerAffinity?: string;
    fontSize?: number;
    fontWeight?: string;
    locked?: boolean;
    audioUrl?: string;
    audioDuration?: number;
  } = {},
): ShapeJSON {
  const w = opts.width ?? 300;
  const h = opts.height ?? 60;

  let displayContent: string;
  if (_fullContent) {
    displayContent = content;
  } else {
    const charsPerLine = Math.floor((w - 16) / 7);
    const lines = Math.floor((h - 16) / ((opts.fontSize ?? 14) * 1.3));
    const maxChars = charsPerLine * Math.max(lines, 1);
    displayContent = truncate(content, maxChars);
  }

  return {
    id,
    type: "text-block",
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    locked: opts.locked ?? false,
    data: {
      content: displayContent,
      fieldMapping: opts.fieldMapping ?? null,
      cornerAffinity: opts.cornerAffinity ?? null,
      ...(opts.fontSize ? { fontSize: opts.fontSize } : {}),
      ...(opts.fontWeight ? { fontWeight: opts.fontWeight } : {}),
      ...(opts.audioUrl ? { audioUrl: opts.audioUrl, audioDuration: opts.audioDuration ?? 0 } : {}),
    },
    metadata: {
      fieldMapping: opts.fieldMapping ?? null,
      cornerAffinity: opts.cornerAffinity ?? null,
    },
  };
}

// ── main transform ─────────────────────────────────────────────────────

export function transformToCanvasDocument(
  project: ProjectRecord,
  layout: LayoutMode = "grid",
  _colorMode: "dark" | "light" = "dark",
  options?: { fullContent?: boolean },
): CanvasDocument {
  _fullContent = options?.fullContent ?? false;
  const m = project.metadata;
  const shapes: ShapeJSON[] = [];
  const conns: ConnectionJSON[] = [];
  const colors = resolveCornerColors();

  // Build field -> audio URL map from voice transcriptions
  const fieldAudioMap = new Map<string, { url: string; duration: number }>();
  m.voiceTranscriptions?.forEach((vt) => {
    if (vt.fieldId && (vt.audioDataUrl || vt.audioStorageUrl)) {
      fieldAudioMap.set(vt.fieldId, {
        url: vt.audioDataUrl || vt.audioStorageUrl || "",
        duration: vt.duration || 0,
      });
    }
  });

  // Use the editor's layout system — identical grid positions
  const isMobile = layout === "vertical";
  const grid = getLayout(isMobile ? 375 : undefined);
  const pad = 20;
  const fieldW = Math.min(300, grid.zw - pad * 2);

  // ── zone shapes (same as editor) ──────────────────────────────────

  const corners = ["context", "links", "backstory", "cc"] as const;
  type CornerKey = (typeof corners)[number];

  // Map corner keys to project data presence
  const hasContent: Record<CornerKey, boolean> = {
    context: (m.context?.length ?? 0) > 0,
    links: (m.links?.length ?? 0) > 0,
    backstory: !!(
      m.backStory?.text || m.backStory?.author || m.backStory?.publication ||
      m.voiceTranscriptions?.some((v) => v.text)
    ),
    cc: !!(
      m.creativeCommons?.copyright || m.creativeCommons?.description ||
      m.photographerInfo?.bio || m.photographerInfo?.website ||
      m.photographerInfo?.contact || m.photographerInfo?.collaborators ||
      m.ethics?.customEthicsText ||
      m.ethics?.noManipulation || m.ethics?.noStaging ||
      m.ethics?.informedConsent || m.ethics?.identityProtected || m.ethics?.aiAltered ||
      m.location?.formattedLocation ||
      m.photoMetadata?.equipment?.cameraMake
    ),
  };

  corners.forEach((corner) => {
    const pos = grid.positions[corner];
    const color = colors[corner] || "#666";
    const label = CORNER_LABELS[corner] || corner.toUpperCase();

    shapes.push({
      id: `zone-${corner}`,
      type: "zone",
      x: pos.x,
      y: pos.y,
      width: grid.zw,
      height: grid.zh,
      rotation: 0,
      locked: false,
      data: {
        label,
        color,
        collapsed: !hasContent[corner],
      },
      metadata: { corner, empty: !hasContent[corner] },
    });
  });

  // ── center photo card (same sizing as editor) ─────────────────────

  const photoW = Math.min(400, grid.zw * 0.8);
  const photoH = photoW * 0.75;

  if (project.main_image_url) {
    shapes.push({
      id: "photo-main",
      type: "photo-card",
      x: grid.photoX,
      y: grid.photoY,
      width: photoW,
      height: photoH,
      rotation: 0,
      locked: false,
      data: {
        imageUrl: project.main_image_url,
        caption: [
          m.creativeCommons?.description,
          m.backStory?.author || project.author
            ? `\u2014 ${m.backStory?.author || project.author}`
            : "",
        ].filter(Boolean).join(" ") || "",
        credit: m.backStory?.author || project.author || "",
        date: project.date || "",
        nfLabel: !!(m.ethics?.noManipulation && m.ethics?.noStaging),
      },
      metadata: { slug: project.slug || "" },
    });

    // Connect photo to all zones
    corners.forEach((corner) => {
      conns.push(connection("photo-main", `zone-${corner}`));
    });
  }

  // ── backstory children (stacked within zone, same as editor) ──────

  const bsPos = grid.positions.backstory;
  let bsY = 0;

  const bsFields: { id: string; label: string; value: string; field: string; narrative?: boolean }[] = [];
  if (m.backStory?.text) bsFields.push({ id: "bs-text", label: "Story", value: m.backStory.text, field: "backStory.text", narrative: true });
  if (m.backStory?.author) bsFields.push({ id: "bs-author", label: "Author", value: m.backStory.author, field: "backStory.author" });
  if (m.backStory?.publication) bsFields.push({ id: "bs-pub", label: "Publication", value: m.backStory.publication, field: "backStory.publication" });
  if (m.backStory?.date) bsFields.push({ id: "bs-date", label: "Date", value: m.backStory.date, field: "backStory.date" });
  if (m.backStory?.publicationUrl) bsFields.push({ id: "bs-puburl", label: "Pub URL", value: m.backStory.publicationUrl, field: "backStory.publicationUrl" });

  bsFields.forEach((f) => {
    const h = f.narrative ? Math.min(140, grid.zh * 0.35) : Math.min(60, grid.zh * 0.15);
    const sep = f.narrative ? "\n" : ": ";
    const audio = fieldAudioMap.get(f.field);
    shapes.push(
      textBlock(f.id, bsPos.x + pad, bsPos.y + 30 + bsY, `${f.label}${sep}${f.value}`, {
        width: fieldW,
        height: h,
        fieldMapping: f.field,
        cornerAffinity: "backstory",
        fontSize: f.narrative ? 13 : 14,
        audioUrl: audio?.url,
        audioDuration: audio?.duration,
      }),
    );
    conns.push(connection(`zone-backstory`, f.id));
    bsY += h + 10;
  });

  // Voice notes (stacked from bottom of zone, same as editor)
  const voiceW = Math.min(280, grid.zw - pad * 2);
  m.voiceTranscriptions?.forEach((vt, i) => {
    if (!vt.text) return;
    const vnId = `voice-${vt.id || `vt-${i}`}`;
    shapes.push({
      id: vnId,
      type: "voice-note",
      x: bsPos.x + pad,
      y: bsPos.y + grid.zh - 160 - i * 155,
      width: voiceW,
      height: 140,
      rotation: 0,
      locked: false,
      data: {
        audioUrl: vt.audioDataUrl || vt.audioStorageUrl || undefined,
        audioStoragePath: vt.audioStoragePath || undefined,
        duration: vt.duration || 0,
        transcriptionText: _fullContent ? vt.text : truncate(vt.text, 200),
        mimeType: vt.mimeType || undefined,
      },
      metadata: { cornerAffinity: "backstory" },
    });
    conns.push(connection(`zone-backstory`, vnId));
  });

  // ── authorship/cc children (stacked within zone) ──────────────────

  const ccPos = grid.positions.cc;
  const ccFieldW = Math.min(280, grid.zw - pad * 2);
  let ccY = 0;

  const ccFields: { id: string; label: string; value: string; field: string; narrative?: boolean }[] = [];
  if (m.creativeCommons?.description) ccFields.push({ id: "cc-desc", label: "Caption", value: m.creativeCommons.description, field: "creativeCommons.description", narrative: true });
  if (m.creativeCommons?.copyright) ccFields.push({ id: "cc-copy", label: "Copyright", value: m.creativeCommons.copyright, field: "creativeCommons.copyright" });
  if (m.photographerInfo?.bio) ccFields.push({ id: "pi-bio", label: "Bio", value: m.photographerInfo.bio, field: "photographerInfo.bio", narrative: true });
  if (m.photographerInfo?.website) ccFields.push({ id: "pi-web", label: "Website", value: m.photographerInfo.website, field: "photographerInfo.website" });
  if (m.photographerInfo?.contact) ccFields.push({ id: "pi-contact", label: "Contact", value: m.photographerInfo.contact, field: "photographerInfo.contact" });
  if (m.photographerInfo?.collaborators) ccFields.push({ id: "pi-collab", label: "Collaborators", value: m.photographerInfo.collaborators, field: "photographerInfo.collaborators" });
  if (m.ethics?.customEthicsText) ccFields.push({ id: "eth-text", label: "Ethics", value: m.ethics.customEthicsText, field: "ethics.customEthicsText" });

  ccFields.forEach((f) => {
    const h = f.narrative ? Math.min(100, grid.zh * 0.25) : Math.min(55, grid.zh * 0.14);
    const sep = f.narrative ? "\n" : ": ";
    const audio = fieldAudioMap.get(f.field);
    shapes.push(
      textBlock(f.id, ccPos.x + pad, ccPos.y + 30 + ccY, `${f.label}${sep}${f.value}`, {
        width: ccFieldW,
        height: h,
        fieldMapping: f.field,
        cornerAffinity: "cc",
        audioUrl: audio?.url,
        audioDuration: audio?.duration,
      }),
    );
    conns.push(connection(`zone-cc`, f.id));
    ccY += h + 8;
  });

  // Ethics flags summary
  const ethicsFlags: string[] = [];
  if (m.ethics?.noManipulation) ethicsFlags.push("No manipulation");
  if (m.ethics?.noStaging) ethicsFlags.push("No staging");
  if (m.ethics?.informedConsent) ethicsFlags.push("Informed consent");
  if (m.ethics?.identityProtected) ethicsFlags.push("Identity protected");
  if (m.ethics?.aiAltered) ethicsFlags.push("AI altered");
  if (ethicsFlags.length > 0) {
    const id = "eth-flags";
    shapes.push(
      textBlock(id, ccPos.x + pad, ccPos.y + 30 + ccY, ethicsFlags.join(" \u00b7 "), {
        width: ccFieldW, height: 36, cornerAffinity: "cc", fontSize: 11, locked: true,
      }),
    );
    conns.push(connection(`zone-cc`, id));
    ccY += 44;
  }

  // Location summary
  if (m.location?.formattedLocation) {
    const id = "loc-fmt";
    shapes.push(
      textBlock(id, ccPos.x + pad, ccPos.y + 30 + ccY, `Location: ${m.location.formattedLocation}`, {
        width: ccFieldW, height: 36, cornerAffinity: "cc", fontSize: 11, locked: true,
      }),
    );
    conns.push(connection(`zone-cc`, id));
    ccY += 44;
  }

  // Camera/EXIF summary
  const camParts: string[] = [];
  if (m.photoMetadata?.equipment?.cameraMake) camParts.push(m.photoMetadata.equipment.cameraMake);
  if (m.photoMetadata?.equipment?.cameraModel) camParts.push(m.photoMetadata.equipment.cameraModel);
  if (m.photoMetadata?.equipment?.lensModel) camParts.push(m.photoMetadata.equipment.lensModel);
  if (camParts.length > 0) {
    const id = "cam-equip";
    shapes.push(
      textBlock(id, ccPos.x + pad, ccPos.y + 30 + ccY, camParts.join(" \u00b7 "), {
        width: ccFieldW, height: 36, cornerAffinity: "cc", fontSize: 11, locked: true,
      }),
    );
    conns.push(connection(`zone-cc`, id));
    ccY += 44;
  }

  // ── context/imagery children (3-column grid, same as editor) ──────

  const ctxPos = grid.positions.context;
  const ctxItemW = Math.min(180, (grid.zw - 60) / 3);
  const contextItems = m.context?.slice(0, 12) ?? [];

  contextItems.forEach((item, i) => {
    const id = `ctx-${item.id || `ci-${i}`}`;
    shapes.push({
      id,
      type: "context-item",
      x: ctxPos.x + pad + (i % 3) * (ctxItemW + 15),
      y: ctxPos.y + 30 + Math.floor(i / 3) * (ctxItemW + 40),
      width: ctxItemW,
      height: ctxItemW + 20,
      rotation: 0,
      locked: false,
      data: {
        imageSrc: item.storage_url || item.url || item.src || item.thumbnailDataUrl || "",
        caption: item.caption || item.filename || "",
        mediaType: item.type || "image",
        contextIndex: i,
        audioUrl: item.audioStorageUrl || item.audioDataUrl || undefined,
        audioDuration: item.audioDuration || 0,
        mimeType: item.mimeType || undefined,
      },
      metadata: { parentCorner: "context" },
    });
    conns.push(connection(`zone-context`, id));
  });

  // ── link children (vertical stack, same as editor) ────────────────

  const linksPos = grid.positions.links;
  const linkW = Math.min(240, grid.zw - pad * 2);
  const linkItems = m.links?.slice(0, 12) ?? [];

  linkItems.forEach((link, i) => {
    const id = `link-${i}`;
    shapes.push({
      id,
      type: "link-card",
      x: linksPos.x + pad,
      y: linksPos.y + 30 + i * 84,
      width: linkW,
      height: 72,
      rotation: 0,
      locked: false,
      data: {
        url: link.url || "",
        title: link.title || "",
        domain: extractDomain(link.url || ""),
      },
      metadata: { parentCorner: "links" },
    });
    conns.push(connection(`zone-links`, id));
  });

  // ── canvas document ───────────────────────────────────────────────

  return {
    version: "1.0",
    canvas: {
      width: grid.totalW,
      height: grid.totalH,
      camera: { x: 0, y: 0, zoom: 1 }, // fitCamera will override on mount
      gridSize: 20,
    },
    shapes,
    zones: corners.map((corner) => ({
      id: `zone-${corner}`,
      label: (CORNER_LABELS[corner] || corner).toUpperCase(),
      bounds: {
        x: grid.positions[corner].x,
        y: grid.positions[corner].y,
        width: grid.zw,
        height: grid.zh,
      },
      shapeIds: [],
    })),
    connections: conns,
  };
}
