"use client";

import { MapPin, User, Calendar, Shield } from "lucide-react";
import type { FourCornersMetadataExtended } from "@/lib/schema";

/**
 * Mobile-first compact metadata preview below the main image cutline.
 * Shows author, location, date, and ethics badges at a glance.
 */
export function MetadataSummary({ metadata }: { metadata: FourCornersMetadataExtended }) {
  const author = metadata.backStory?.author;
  const location = metadata.location?.formattedLocation;
  const date = metadata.backStory?.date || metadata.photoMetadata?.dateTaken;
  const ethics = metadata.ethics;

  const badges: Array<{ label: string; key: string }> = [];
  if (ethics?.noManipulation) badges.push({ label: "Unmanipulated", key: "noManip" });
  if (ethics?.noStaging) badges.push({ label: "Not Staged", key: "noStage" });
  if (ethics?.informedConsent) badges.push({ label: "Consent", key: "consent" });
  if (ethics?.identityProtected) badges.push({ label: "Identity Protected", key: "identity" });
  if (ethics?.aiAltered) badges.push({ label: "AI Altered", key: "ai" });

  const hasContent = author || location || date || badges.length > 0;
  if (!hasContent) return null;

  return (
    <div className="fc-meta-summary">
      {author && (
        <div className="fc-meta-summary__row">
          <User size={14} className="fc-meta-summary__icon" />
          <span className="fc-meta-summary__text">{author}</span>
        </div>
      )}
      {location && (
        <div className="fc-meta-summary__row">
          <MapPin size={14} className="fc-meta-summary__icon" />
          <span className="fc-meta-summary__text">{location}</span>
        </div>
      )}
      {date && (
        <div className="fc-meta-summary__row">
          <Calendar size={14} className="fc-meta-summary__icon" />
          <span className="fc-meta-summary__text">{date}</span>
        </div>
      )}
      {badges.length > 0 && (
        <div className="fc-meta-summary__row">
          <Shield size={14} className="fc-meta-summary__icon" />
          <div className="fc-meta-summary__badges">
            {badges.map((b) => (
              <span key={b.key} className="fc-meta-summary__badge">{b.label}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
