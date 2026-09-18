"use client";

import Link from "next/link";
import type { FourCornersMetadataExtended } from "@/lib/schema";

/**
 * Render a URL string as a clickable link, or plain text with inline URL detection.
 * Relative URLs render as in-app links; external URLs open in a new tab.
 */
function IIIFFieldValue({ value, label }: { value: string; label: string }) {
  const trimmed = value.trim();

  if (trimmed.startsWith("/")) {
    return (
      <Link href={trimmed} className="fc-iiif-link">
        View in app
      </Link>
    );
  }

  const isUrl = /^https?:\/\//i.test(trimmed);
  if (isUrl) {
    return (
      <a href={trimmed} target="_blank" rel="noopener noreferrer" className="fc-iiif-link">
        {trimmed}
      </a>
    );
  }

  // Detect inline URLs in longer text
  const parts = value.split(/(https?:\/\/[^\s<]+)/g);
  if (parts.length > 1) {
    return (
      <span>
        {parts.map((part, i) =>
          /^https?:\/\//i.test(part) ? (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="fc-iiif-link">
              {part}
            </a>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </span>
    );
  }

  return <span>{value}</span>;
}

/**
 * IIIF Presentation 3.0 metadata viewer tab.
 * Displays all project metadata grouped by section in a structured layout.
 */
export function IIIFViewerTab({
  metadata,
}: {
  metadata: FourCornersMetadataExtended & { title?: string };
}) {
  const sectionOrder = ["credit", "backstory", "location", "technical", "image", "ethics", "transcription", "links", "meta"] as const;
  const sectionLabels: Record<string, string> = {
    credit: "Authorship & Credit",
    backstory: "Backstory",
    location: "Location & Geography",
    technical: "Technical Metadata",
    image: "Image Properties",
    ethics: "Ethics & Provenance",
    transcription: "Voice Transcriptions",
    links: "External Links",
    meta: "Record Information",
  };

  const iiifMetadata: Array<{ label: string; value: string; section: string }> = [];

  // === Authorship / Credit ===
  if (metadata.title) iiifMetadata.push({ label: "Title", value: metadata.title, section: "credit" });
  if (metadata.creativeCommons?.description) iiifMetadata.push({ label: "Caption", value: metadata.creativeCommons.description, section: "credit" });
  if (metadata.creativeCommons?.copyright) iiifMetadata.push({ label: "Rights", value: metadata.creativeCommons.copyright, section: "credit" });
  if (metadata.backStory?.author) iiifMetadata.push({ label: "Creator", value: metadata.backStory.author, section: "credit" });
  if (metadata.photographerInfo?.bio) iiifMetadata.push({ label: "Photographer Bio", value: metadata.photographerInfo.bio, section: "credit" });
  if (metadata.photographerInfo?.contact) iiifMetadata.push({ label: "Contact", value: metadata.photographerInfo.contact, section: "credit" });
  if (metadata.photographerInfo?.website) iiifMetadata.push({ label: "Homepage", value: metadata.photographerInfo.website, section: "credit" });
  if (metadata.photographerInfo?.collaborators) iiifMetadata.push({ label: "Collaborators", value: metadata.photographerInfo.collaborators, section: "credit" });

  // === Backstory ===
  if (metadata.backStory?.text) iiifMetadata.push({ label: "Backstory", value: metadata.backStory.text, section: "backstory" });
  if (metadata.backStory?.publication) iiifMetadata.push({ label: "Publisher", value: metadata.backStory.publication, section: "backstory" });
  if (metadata.backStory?.publicationUrl) iiifMetadata.push({ label: "Publisher URL", value: metadata.backStory.publicationUrl, section: "backstory" });
  if (metadata.backStory?.date) iiifMetadata.push({ label: "Date", value: metadata.backStory.date, section: "backstory" });

  // === Location ===
  if (metadata.location?.formattedLocation) iiifMetadata.push({ label: "Location", value: metadata.location.formattedLocation, section: "location" });
  if (metadata.location?.latitude && metadata.location?.longitude) {
    iiifMetadata.push({ label: "Coordinates", value: `${metadata.location.latitude}, ${metadata.location.longitude}`, section: "location" });
  }
  if (metadata.location?.city) iiifMetadata.push({ label: "City", value: metadata.location.city, section: "location" });
  if (metadata.location?.state) iiifMetadata.push({ label: "State/Region", value: metadata.location.state, section: "location" });
  if (metadata.location?.country) iiifMetadata.push({ label: "Country", value: metadata.location.country, section: "location" });
  if (metadata.location?.address) {
    const addr = metadata.location.address;
    const addrParts = [addr.street, addr.street2, addr.district, addr.city, addr.stateProvince, addr.postalCode, addr.country].filter(Boolean);
    if (addrParts.length > 0) iiifMetadata.push({ label: "Address", value: addrParts.join(", "), section: "location" });
  }
  if (metadata.location?.source) iiifMetadata.push({ label: "Location Source", value: metadata.location.source, section: "location" });
  if (metadata.location?.capturedAt) iiifMetadata.push({ label: "Location Captured", value: metadata.location.capturedAt, section: "location" });

  // === Photo Metadata — Technical ===
  if (metadata.photoMetadata?.dateTaken) iiifMetadata.push({ label: "Date Taken", value: metadata.photoMetadata.dateTaken, section: "technical" });
  if (metadata.photoMetadata?.equipment) {
    const eq = metadata.photoMetadata.equipment;
    if (eq.cameraMake || eq.cameraModel) iiifMetadata.push({ label: "Camera", value: `${eq.cameraMake || ""} ${eq.cameraModel || ""}`.trim(), section: "technical" });
    if (eq.lensModel) iiifMetadata.push({ label: "Lens", value: eq.lensModel, section: "technical" });
    if (eq.focalLength) iiifMetadata.push({ label: "Focal Length", value: eq.focalLength, section: "technical" });
    if (eq.aperture) iiifMetadata.push({ label: "Aperture", value: eq.aperture, section: "technical" });
    if (eq.shutterSpeed) iiifMetadata.push({ label: "Shutter Speed", value: eq.shutterSpeed, section: "technical" });
    if (eq.iso) iiifMetadata.push({ label: "ISO", value: String(eq.iso), section: "technical" });
  }
  if (metadata.photoMetadata?.device) {
    const dev = metadata.photoMetadata.device;
    if (dev.software) iiifMetadata.push({ label: "Software", value: dev.software, section: "technical" });
    if (dev.hostComputer) iiifMetadata.push({ label: "Host Computer", value: dev.hostComputer, section: "technical" });
    if (dev.artist) iiifMetadata.push({ label: "EXIF Artist", value: dev.artist, section: "technical" });
    if (dev.copyright) iiifMetadata.push({ label: "EXIF Copyright", value: dev.copyright, section: "technical" });
    if (dev.userComment) iiifMetadata.push({ label: "User Comment", value: dev.userComment, section: "technical" });
    if (dev.imageDescription) iiifMetadata.push({ label: "Image Description", value: dev.imageDescription, section: "technical" });
  }
  if (metadata.photoMetadata?.temporal) {
    const t = metadata.photoMetadata.temporal;
    if (t.dateTimeOriginal) iiifMetadata.push({ label: "DateTime Original", value: t.dateTimeOriginal, section: "technical" });
    if (t.dateTimeDigitized) iiifMetadata.push({ label: "DateTime Digitized", value: t.dateTimeDigitized, section: "technical" });
    if (t.dateModified) iiifMetadata.push({ label: "Date Modified", value: t.dateModified, section: "technical" });
  }
  if (metadata.photoMetadata?.gps) {
    const g = metadata.photoMetadata.gps;
    if (g.altitude != null) iiifMetadata.push({ label: "GPS Altitude", value: `${g.altitude}${g.altitudeRef != null ? ` (ref: ${g.altitudeRef})` : ""}`, section: "technical" });
    if (g.speed != null) iiifMetadata.push({ label: "GPS Speed", value: `${g.speed}${g.speedRef ? ` ${g.speedRef}` : ""}`, section: "technical" });
    if (g.imgDirection != null) iiifMetadata.push({ label: "Image Direction", value: `${g.imgDirection}°${g.imgDirectionRef ? ` ${g.imgDirectionRef}` : ""}`, section: "technical" });
  }

  // === Image Properties ===
  if (metadata.photoMetadata?.image) {
    const img = metadata.photoMetadata.image;
    if (img.width && img.height) iiifMetadata.push({ label: "Dimensions", value: `${img.width} × ${img.height} px`, section: "image" });
    if (img.orientation) iiifMetadata.push({ label: "Orientation", value: String(img.orientation), section: "image" });
  }

  // === Ethics ===
  if (metadata.ethics) {
    const e = metadata.ethics;
    const badges: string[] = [];
    if (e.noManipulation) badges.push("Unmanipulated");
    if (e.noStaging) badges.push("Not Staged");
    if (e.informedConsent) badges.push("Informed Consent");
    if (e.identityProtected) badges.push("Identity Protected");
    if (e.aiAltered) badges.push("AI Altered");
    if (badges.length > 0) iiifMetadata.push({ label: "Ethics Declarations", value: badges.join(", "), section: "ethics" });
    if (e.customEthicsText) iiifMetadata.push({ label: "Ethics Statement", value: e.customEthicsText, section: "ethics" });
    if (e.manipulationDetails) iiifMetadata.push({ label: "Manipulation Details", value: e.manipulationDetails, section: "ethics" });
    if (e.stagingDetails) iiifMetadata.push({ label: "Staging Details", value: e.stagingDetails, section: "ethics" });
    if (e.consentDetails) iiifMetadata.push({ label: "Consent Details", value: e.consentDetails, section: "ethics" });
    if (e.identityProtectionDetails) iiifMetadata.push({ label: "Identity Protection", value: e.identityProtectionDetails, section: "ethics" });
    if (e.aiAlteredDetails) iiifMetadata.push({ label: "AI Alteration Details", value: e.aiAlteredDetails, section: "ethics" });
    if (e.consentDocumentUrl) iiifMetadata.push({ label: "Consent Document", value: e.consentDocumentUrl, section: "ethics" });
  }

  // === Voice Transcriptions ===
  if (metadata.voiceTranscriptions && metadata.voiceTranscriptions.length > 0) {
    metadata.voiceTranscriptions.forEach((t: { text?: string; transcribedAt?: string; fieldId?: string }, i: number) => {
      if (t.text) iiifMetadata.push({ label: `Transcription ${i + 1}`, value: t.text, section: "transcription" });
      if (t.transcribedAt) iiifMetadata.push({ label: `Transcribed At ${i + 1}`, value: t.transcribedAt, section: "transcription" });
      if (t.fieldId) iiifMetadata.push({ label: `Associated Field ${i + 1}`, value: t.fieldId, section: "transcription" });
    });
  }

  // === Links ===
  if (metadata.links && metadata.links.length > 0) {
    metadata.links.forEach((link: { title?: string; url?: string; source?: string }) => {
      if (link.title || link.url) iiifMetadata.push({ label: link.title || "Link", value: link.url || "", section: "links" });
      if (link.source) iiifMetadata.push({ label: `${link.title || "Link"} — Source`, value: link.source, section: "links" });
    });
  }

  // === Record / Meta ===
  if (metadata.meta) {
    if (metadata.meta.createdAt) iiifMetadata.push({ label: "Created", value: metadata.meta.createdAt, section: "meta" });
    if (metadata.meta.updatedAt) iiifMetadata.push({ label: "Last Modified", value: metadata.meta.updatedAt, section: "meta" });
    if (metadata.meta.editorVersion) iiifMetadata.push({ label: "Editor Version", value: metadata.meta.editorVersion, section: "meta" });
    if (metadata.meta.mode) iiifMetadata.push({ label: "Editor Mode", value: metadata.meta.mode, section: "meta" });
  }

  const groupedSections = sectionOrder
    .map((key) => ({
      key,
      label: sectionLabels[key],
      items: iiifMetadata.filter((m) => m.section === key),
    }))
    .filter((s) => s.items.length > 0);

  const totalFields = iiifMetadata.length;

  return (
    <div className="max-w-6xl 2xl:max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-4 mt-4">
        <span className="text-xs font-mono px-2 py-0.5 bg-accent/20 text-accent rounded">IIIF</span>
        <span className="text-sm fc-view-subtext">Presentation 3.0</span>
        <span className="fc-view-subtext">·</span>
        <span className="text-sm fc-view-subtext">{totalFields} fields</span>
        <span className="fc-view-subtext">·</span>
        <span className="text-sm fc-view-subtext">{groupedSections.length} sections</span>
      </div>

      <div className="fc-iiif-meta bg-surface-alt rounded-lg">
        {groupedSections.map((section) => (
          <div key={section.key} className="fc-iiif-section">
            <h3 className="fc-iiif-section__heading">{section.label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {section.items.map((item, i) => (
                <div key={i} className="fc-iiif-field">
                  <dt className="fc-iiif-field__label">{item.label}</dt>
                  <dd className="fc-iiif-field__value">
                    <IIIFFieldValue value={item.value} label={item.label} />
                  </dd>
                </div>
              ))}
            </div>
          </div>
        ))}
        {totalFields === 0 && (
          <p className="text-sm fc-view-subtext p-4">No metadata available</p>
        )}
      </div>
    </div>
  );
}
