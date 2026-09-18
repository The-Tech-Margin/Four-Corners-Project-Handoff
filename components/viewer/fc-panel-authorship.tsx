"use client";

import type { CodeOfEthics, PhotographerInfo, LocationData, PhotoMetadata, VoiceTranscription } from "@/lib/field-registry";
import { Check, X as XIcon, MapPin, Camera, Calendar, Mic } from "lucide-react";
import { FCRichText } from "./fc-rich-text";
import { FCVoiceNoteClip } from "@/components/fc-voice-note";

export interface AuthorshipData {
  caption?: string;
  credit?: string;
  author?: string;
  ethics?: CodeOfEthics;
  photographerInfo?: PhotographerInfo;
}

export interface FCPanelAuthorshipProps {
  data: AuthorshipData;
  location?: LocationData;
  photoMetadata?: PhotoMetadata;
  voiceTranscriptions?: VoiceTranscription[];
}

/**
 * Authorship panel content (top-left corner).
 * Maps to fourcorners.js "Authorship" which contains:
 * - Caption/credit
 * - Ethics declarations
 * - Photographer info
 * - Location data
 * - Camera/photo metadata
 */
export function FCPanelAuthorship({ data, location, photoMetadata, voiceTranscriptions }: FCPanelAuthorshipProps) {
  const { caption, credit, author, ethics, photographerInfo } = data;

  // Group voice recordings by their fieldId so each appears with its field
  const getRecordingsForField = (fieldId: string) =>
    voiceTranscriptions?.filter((vt) => vt.fieldId === fieldId) || [];

  // Recordings with no fieldId or unrecognized fieldId (legacy/orphaned)
  const orphanedRecordings = voiceTranscriptions?.filter(
    (vt) =>
      !vt.fieldId ||
      (!vt.fieldId.startsWith("context-") &&
        vt.fieldId !== "backstory-text" &&
        vt.fieldId !== "caption-description" &&
        vt.fieldId !== "photographer-bio" &&
        vt.fieldId !== "ethics-custom-text"),
  ) || [];

  // NOTE: backstory recordings are NOT shown here — they belong in the backstory panel
  const captionRecordings = getRecordingsForField("caption-description");
  const bioRecordings = getRecordingsForField("photographer-bio");
  const ethicsRecordings = getRecordingsForField("ethics-custom-text");

  const hasVoiceRecordings =
    captionRecordings.length > 0 ||
    bioRecordings.length > 0 ||
    ethicsRecordings.length > 0 ||
    orphanedRecordings.length > 0;

  const hasEthics = ethics && (
    ethics.noManipulation ||
    ethics.noStaging ||
    ethics.informedConsent ||
    ethics.identityProtected ||
    ethics.customEthicsText ||
    ethics.aiAltered
  );

  const isAiAltered = ethics?.aiAltered;

  const hasPhotographerInfo = photographerInfo && (
    photographerInfo.bio ||
    photographerInfo.website ||
    photographerInfo.contact ||
    photographerInfo.collaborators
  );

  const hasLocation = location && (
    location.formattedLocation ||
    (location.latitude && location.longitude)
  );

  const hasEquipment = photoMetadata?.equipment && (
    photoMetadata.equipment.cameraMake ||
    photoMetadata.equipment.cameraModel ||
    photoMetadata.equipment.lensModel ||
    photoMetadata.equipment.focalLength ||
    photoMetadata.equipment.iso ||
    photoMetadata.equipment.aperture ||
    photoMetadata.equipment.shutterSpeed
  );

  const hasDevice = photoMetadata?.device && (
    photoMetadata.device.software ||
    photoMetadata.device.hostComputer ||
    photoMetadata.device.artist ||
    photoMetadata.device.copyright ||
    photoMetadata.device.imageDescription ||
    photoMetadata.device.userComment
  );

  // GPS readings beyond lat/lon (which render in the Location block).
  // gpsScalar values can be number | string | null — format only non-null.
  const gps = photoMetadata?.gps;
  const gpsReadings = gps
    ? [
        gps.altitude != null && `altitude ${gps.altitude}${gps.altitudeRef ? ` (${gps.altitudeRef})` : ""} m`,
        gps.speed != null && `speed ${gps.speed}${gps.speedRef ? ` ${gps.speedRef}` : ""}`,
        gps.imgDirection != null && `direction ${gps.imgDirection}°${gps.imgDirectionRef ? ` ${gps.imgDirectionRef}` : ""}`,
        gps.destBearing != null && `bearing ${gps.destBearing}°${gps.destBearingRef ? ` ${gps.destBearingRef}` : ""}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const hasGpsExtras = gpsReadings.length > 0;

  const imgW = Number(photoMetadata?.image?.width) || 0;
  const imgH = Number(photoMetadata?.image?.height) || 0;
  const hasImageDims = imgW > 0 && imgH > 0;

  const hasDateTaken = photoMetadata?.dateTaken || photoMetadata?.temporal?.dateTimeOriginal;

  const hasAnyContent = caption || credit || author || hasEthics || hasPhotographerInfo || hasLocation || hasEquipment || hasDevice || hasGpsExtras || hasImageDims || hasDateTaken || hasVoiceRecordings;

  // Format camera settings string
  const getCameraSettings = () => {
    const settings: string[] = [];
    const eq = photoMetadata?.equipment;
    if (!eq) return null;

    if (eq.focalLength) settings.push(eq.focalLength);
    if (eq.aperture) settings.push(eq.aperture);
    if (eq.shutterSpeed) settings.push(eq.shutterSpeed);
    if (eq.iso) settings.push(`ISO ${eq.iso}`);

    return settings.length > 0 ? settings.join(" · ") : null;
  };

  const cameraSettings = getCameraSettings();

  return (
    <div className="space-y-4">
      {/* AI Altered Banner - shown prominently at top */}
      {isAiAltered && (
        <div className="fc-ai-badge">
          <div className="fc-ai-badge__icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
              />
            </svg>
          </div>
          <div className="fc-ai-badge__content">
            <span className="fc-ai-badge__label">AI-Altered Content</span>
            {ethics?.aiAlteredDetails && (
              <p className="fc-ai-badge__details">{ethics.aiAlteredDetails}</p>
            )}
          </div>
        </div>
      )}

      {/* Author - displayed prominently */}
      {author && (
        <div className="fc-panel__author-block">
          <h4 className="fc-panel__label">Author</h4>
          <p className="fc-panel__author">{author}</p>
        </div>
      )}

      {/* Caption + its voice recordings */}
      {caption && (
        <div>
          <h4 className="fc-panel__label">Caption</h4>
          <p className="fc-panel__text">{caption}</p>
        </div>
      )}
      {captionRecordings.length > 0 && (
        <div className="space-y-2">
          {captionRecordings.map((vt) => (
            <VoiceRecordingItem key={vt.id} transcription={vt} fieldText={caption} />
          ))}
        </div>
      )}

      {/* Credit */}
      {credit && (
        <div>
          <h4 className="fc-panel__label">Credit</h4>
          <p className="fc-panel__text">{credit}</p>
        </div>
      )}

      {/* Photographer Info + bio voice recordings */}
      {(hasPhotographerInfo || bioRecordings.length > 0) && (
        <div className="space-y-2">
          {photographerInfo?.bio && (
            <div>
              <h4 className="fc-panel__label">Bio</h4>
              <FCRichText text={photographerInfo.bio} className="fc-panel__text" />
            </div>
          )}
          {bioRecordings.length > 0 && (
            <div className="space-y-2">
              {bioRecordings.map((vt) => (
                <VoiceRecordingItem key={vt.id} transcription={vt} fieldText={photographerInfo?.bio} />
              ))}
            </div>
          )}
          {photographerInfo?.website && (
            <div>
              <h4 className="fc-panel__label">Website</h4>
              <a
                href={photographerInfo.website}
                target="_blank"
                rel="noopener noreferrer"
                className="fc-panel__link"
              >
                {photographerInfo.website}
              </a>
            </div>
          )}
          {photographerInfo?.contact && (
            <div>
              <h4 className="fc-panel__label">Contact</h4>
              <AutoLink text={photographerInfo.contact} className="fc-panel__text" linkClassName="fc-panel__link" />
            </div>
          )}
          {photographerInfo?.collaborators && (
            <div>
              <h4 className="fc-panel__label">Collaborators</h4>
              <p className="fc-panel__text">{photographerInfo.collaborators}</p>
            </div>
          )}
        </div>
      )}

      {/* Orphaned voice recordings (no fieldId or unrecognized field) */}
      {orphanedRecordings.length > 0 && (
        <div>
          <h4 className="fc-panel__label flex items-center gap-1.5">
            <Mic size={12} className="opacity-60" />
            Audio Recordings
          </h4>
          <div className="space-y-2 mt-2">
            {orphanedRecordings.map((vt) => (
              <VoiceRecordingItem key={vt.id} transcription={vt} />
            ))}
          </div>
        </div>
      )}

      {/* Ethics - only show items that the user explicitly checked */}
      {(hasEthics || ethicsRecordings.length > 0) && (
        <div>
          <h4 className="fc-panel__label">Code of Ethics</h4>
          <div className="space-y-2 mt-2">
            {ethics?.noManipulation && (
              <EthicsItem
                checked={true}
                label="No Manipulation"
                details={ethics.manipulationDetails}
              />
            )}
            {ethics?.noStaging && (
              <EthicsItem
                checked={true}
                label="No Staging"
                details={ethics.stagingDetails}
              />
            )}
            {ethics?.informedConsent && (
              <EthicsItem
                checked={true}
                label="Informed Consent"
                details={ethics.consentDetails}
              />
            )}
            {ethics?.identityProtected && (
              <EthicsItem
                checked={true}
                label="Identity Protected"
                details={ethics.identityProtectionDetails}
              />
            )}
            {ethics?.customEthicsText && (
              <FCRichText text={ethics.customEthicsText} className="fc-panel__text text-sm italic mt-2" />
            )}
            {ethicsRecordings.length > 0 && (
              <div className="space-y-2 mt-2">
                {ethicsRecordings.map((vt) => (
                  <VoiceRecordingItem key={vt.id} transcription={vt} fieldText={ethics?.customEthicsText} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Technical metadata — after person-related sections ── */}

      {/* Date Taken */}
      {hasDateTaken && (
        <div>
          <h4 className="fc-panel__label flex items-center gap-1.5">
            <Calendar size={12} className="opacity-60" />
            Date Taken
          </h4>
          <p className="fc-panel__text">
            {formatDate(photoMetadata?.dateTaken || photoMetadata?.temporal?.dateTimeOriginal)}
          </p>
        </div>
      )}

      {/* Location */}
      {hasLocation && (
        <div>
          <h4 className="fc-panel__label flex items-center gap-1.5">
            <MapPin size={12} className="opacity-60" />
            Location
          </h4>
          <p className="fc-panel__text">
            {location!.formattedLocation || (() => {
              // lat/lon can arrive as string or number depending on source (DB vs EXIF)
              const lat = Number(location!.latitude);
              const lon = Number(location!.longitude);
              return Number.isFinite(lat) && Number.isFinite(lon)
                ? `${lat.toFixed(6)}, ${lon.toFixed(6)}`
                : "";
            })()}
          </p>
          {location!.address && Object.values(location!.address).some(Boolean) && (
            <p className="fc-panel__text text-xs opacity-80 mt-0.5">
              {[location!.address.street, location!.address.street2, location!.address.city, location!.address.stateProvince, location!.address.postalCode, location!.address.country].filter(Boolean).join(", ")}
            </p>
          )}
          {location!.capturedAt && (
            <p className="fc-panel__text text-xs opacity-70 mt-0.5">
              Captured: {formatDate(location!.capturedAt)}
            </p>
          )}
          {location!.source && (
            <p className="fc-panel__text text-xs opacity-60 mt-0.5">
              Source: {location!.source}
            </p>
          )}
        </div>
      )}

      {/* Camera/Equipment */}
      {hasEquipment && (
        <div>
          <h4 className="fc-panel__label flex items-center gap-1.5">
            <Camera size={12} className="opacity-60" />
            Camera
          </h4>
          <div className="space-y-1">
            {(photoMetadata!.equipment!.cameraMake || photoMetadata!.equipment!.cameraModel) && (
              <p className="fc-panel__text">
                {[photoMetadata!.equipment!.cameraMake, photoMetadata!.equipment!.cameraModel]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            )}
            {photoMetadata!.equipment!.lensModel && (
              <p className="fc-panel__text text-sm opacity-80">
                {photoMetadata!.equipment!.lensModel}
              </p>
            )}
            {cameraSettings && (
              <p className="fc-panel__text text-xs opacity-70">
                {cameraSettings}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Device / Software Info */}
      {hasDevice && (
        <div>
          <h4 className="fc-panel__label">Processing</h4>
          <div className="space-y-1">
            {photoMetadata!.device!.software && (
              <p className="fc-panel__text text-sm">{photoMetadata!.device!.software}</p>
            )}
            {photoMetadata!.device!.hostComputer && (
              <p className="fc-panel__text text-xs opacity-80">Device: {photoMetadata!.device!.hostComputer}</p>
            )}
            {photoMetadata!.device!.artist && (
              <p className="fc-panel__text text-xs opacity-80">Artist: {photoMetadata!.device!.artist}</p>
            )}
            {photoMetadata!.device!.copyright && (
              <p className="fc-panel__text text-xs opacity-80">© {photoMetadata!.device!.copyright}</p>
            )}
            {photoMetadata!.device!.imageDescription && (
              <p className="fc-panel__text text-xs opacity-70">{photoMetadata!.device!.imageDescription}</p>
            )}
            {photoMetadata!.device!.userComment && (
              <p className="fc-panel__text text-xs opacity-70">{photoMetadata!.device!.userComment}</p>
            )}
          </div>
        </div>
      )}

      {/* GPS readings (beyond the lat/lon shown in Location) */}
      {hasGpsExtras && (
        <div>
          <h4 className="fc-panel__label flex items-center gap-1.5">
            <MapPin size={12} className="opacity-60" />
            GPS
          </h4>
          <p className="fc-panel__text text-xs opacity-70">{gpsReadings}</p>
        </div>
      )}

      {/* Image Dimensions */}
      {hasImageDims && (
        <div>
          <h4 className="fc-panel__label">Dimensions</h4>
          <p className="fc-panel__text text-sm">
            {imgW} &times; {imgH} px
            {photoMetadata?.image?.orientation ? (
              <span className="text-xs opacity-70"> · orientation {photoMetadata.image.orientation}</span>
            ) : null}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!hasAnyContent && (
        <p className="fc-panel__empty">No authorship information available.</p>
      )}
    </div>
  );
}

function EthicsItem({
  checked,
  label,
  details,
}: {
  checked?: boolean;
  label: string;
  details?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className={`fc-ethics-indicator ${checked ? "fc-ethics-indicator--yes" : "fc-ethics-indicator--no"}`}>
        {checked ? <Check size={12} /> : <XIcon size={12} />}
      </span>
      <div>
        <span className="fc-panel__text text-sm">{label}</span>
        {details && (
          <p className="fc-panel__text text-xs opacity-70 mt-0.5">{details}</p>
        )}
      </div>
    </div>
  );
}

/** Renders text with auto-detected emails and URLs as clickable links */
function AutoLink({ text, className, linkClassName }: { text: string; className?: string; linkClassName?: string }) {
  const pattern = /(https?:\/\/[^\s]+)|([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const value = match[0];
    const isEmail = match[2] !== undefined;
    parts.push(
      <a
        key={match.index}
        href={isEmail ? `mailto:${value}` : value}
        target={isEmail ? undefined : "_blank"}
        rel={isEmail ? undefined : "noopener noreferrer"}
        className={linkClassName}
      >
        {value}
      </a>,
    );
    last = match.index + value.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p className={className}>{parts}</p>;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function VoiceRecordingItem({ transcription, fieldText }: { transcription: VoiceTranscription; fieldText?: string }) {
  // The field's own text is already on screen — blank out a transcript that
  // merely duplicates it so it never renders twice.
  const deduped =
    transcription.text && fieldText && transcription.text.trim() === fieldText.trim()
      ? { ...transcription, text: "" }
      : transcription;

  return (
    <FCVoiceNoteClip
      transcription={deduped}
      className="bg-surface-alt/50 rounded-lg p-3 space-y-2"
      accentClass="bg-corner-creativeCommons/20"
      accentTextClass="text-corner-creativeCommons"
      renderText={(text) => <p className="fc-panel__text text-sm">{text}</p>}
    />
  );
}
