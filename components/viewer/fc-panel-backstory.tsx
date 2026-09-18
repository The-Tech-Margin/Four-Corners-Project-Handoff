"use client";

import type { BackStory, VoiceTranscription } from "@/lib/field-registry";
import { FCRichText } from "./fc-rich-text";
import { FCVoiceNote } from "@/components/fc-voice-note";

export interface FCPanelBackstoryProps {
  data: BackStory;
  voiceTranscriptions?: VoiceTranscription[];
}

/**
 * Backstory panel content (bottom-left corner).
 * Maps to fourcorners.js "Backstory" which contains:
 * - Narrative text
 * - Author
 * - Publication info
 * - Date
 */
export function FCPanelBackstory({ data, voiceTranscriptions }: FCPanelBackstoryProps) {
  const { text, author, publication, publicationUrl, date } = data;

  // Voice recordings associated with the backstory text field
  const backstoryRecordings = voiceTranscriptions?.filter(
    (vt) => vt.fieldId === "backstory-text",
  ) || [];

  const hasContent = text || author || publication || date || backstoryRecordings.length > 0;

  return (
    <div className="space-y-3">
      {/* Playhead + transcript live in one visually-attached card. Transcript
          starts open by default — users expect the text immediately; the
          disclosure is there to let them collapse if they just want to
          listen. Native <details>/<summary> keeps a11y free. */}
      {backstoryRecordings.length > 0 ? (
        <div className="fc-panel__recording-card">
          <FCVoiceNote
            // The field text below already shows the transcript — blank out
            // clip texts that duplicate it so it never renders twice.
            transcriptions={backstoryRecordings.map((vt) =>
              vt.text && text && vt.text.trim() === text.trim()
                ? { ...vt, text: "" }
                : vt,
            )}
            clipClassName="fc-panel__recording-row"
            accentClass="bg-corner-backstory/20"
            accentTextClass="text-corner-backstory"
            renderText={(t) => (
              <p className="fc-panel__text fc-panel__text--narrative">{t}</p>
            )}
          />
          {text && (
            <details open className="fc-panel__transcript">
              <summary className="fc-panel__transcript-summary">
                <span>Transcript</span>
                <svg
                  className="fc-panel__transcript-chevron"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="fc-panel__transcript-body">
                <FCRichText
                  text={text}
                  className="fc-panel__text fc-panel__text--narrative"
                />
              </div>
            </details>
          )}
        </div>
      ) : (
        /* No recording — narrative text stands alone as primary copy. */
        text && (
          <div>
            <FCRichText
              text={text}
              className="fc-panel__text fc-panel__text--narrative"
            />
          </div>
        )
      )}

      {/* Attribution details */}
      {(author || publication || date) && (
        <div className="fc-panel__meta">
          {author && (
            <div>
              <span className="fc-panel__label-inline">By:</span>{" "}
              <span className="fc-panel__text">{author}</span>
            </div>
          )}
          {publication && (
            <div>
              <span className="fc-panel__label-inline">Publication:</span>{" "}
              {publicationUrl ? (
                <a
                  href={publicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fc-panel__link"
                >
                  {publication}
                </a>
              ) : (
                <span className="fc-panel__text">{publication}</span>
              )}
            </div>
          )}
          {date && (
            <div>
              <span className="fc-panel__label-inline">Date:</span>{" "}
              <span className="fc-panel__text">{date}</span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasContent && (
        <p className="fc-panel__empty">No backstory available.</p>
      )}
    </div>
  );
}

