"use client";

import { useFourCornersStore } from "@/lib/store";
import { VoiceInput } from "@/components/voice-input";
import { VoiceTextarea } from "@/components/voice-textarea";

export function EthicsControls() {
  const ethics = useFourCornersStore((s) => s.ethics);
  const updateEthics = useFourCornersStore((s) => s.updateEthics);

  return (
    <div className="fc-zone-fields">
      <span className="fc-zone-field__label">Ethics</span>

      <div className="fc-zone-field">
        <select
          value={ethics?.customEthicsText || ""}
          onChange={(e) => updateEthics("customEthicsText", e.target.value)}
          className="fc-zone-field__select"
        >
          <option value="">Select a code of ethics...</option>
          <option value="As a staff member of Associated Press, I abide by AP's ethics code.">Associated Press</option>
          <option value="As a documentary photographer, I strive to authentically represent the subjects and events I document. I do not stage scenes or digitally alter the content of my photographs in ways that misrepresent reality.">Documentary Photographer</option>
          <option value="As a fine art photographer, I may alter my images in pursuit of my own artistic vision.">Fine Art Photographer</option>
          <option value="While all photography is interpretive, as a photojournalist my photographs are meant to respect the visible facts of the situations I depict. I do not add or subtract elements to or from my photographs.">Photojournalist</option>
          <option value="As a non-fiction photographer, my images are intended to truthfully represent real events, people, and places. I do not stage or fabricate scenes and any post-processing is limited to standard adjustments that do not alter the factual content of the image.">Non-Fiction Photographer</option>
          <option value="As a sports photographer, I do not re-stage events.">Sports Photographer</option>
          <option value="While on assignment for UNICEF, I abide by UNICEF's ethics code. I do not show the faces of children who are HIV-positive or who have been child soldiers.">UNICEF</option>
          <option value="As a wildlife photographer, all my photographs depict animals in the wild unless otherwise specified.">Wildlife Photographer</option>
        </select>
        <VoiceTextarea
          value={ethics?.customEthicsText || ""}
          onChange={(v) => updateEthics("customEthicsText", v)}
          placeholder="Your code of ethics statement..."
          rows={2}
                 />
      </div>

      <div className="fc-zone-toggles">
        {/* AI Altered */}
        <div>
          <label className="fc-zone-toggle">
            <input type="checkbox" checked={!!ethics?.aiAltered} onChange={(e) => updateEthics("aiAltered", e.target.checked)} className="fc-zone-toggle__input" />
            <span className="fc-zone-toggle__label">AI-altered or AI-generated</span>
          </label>
          {ethics?.aiAltered && (
            <div className="fc-zone-field fc-zone-field--indent">
              <VoiceInput value={ethics?.aiAlteredDetails || ""} onChange={(v) => updateEthics("aiAlteredDetails", v)} placeholder="Describe AI tools used..." />
            </div>
          )}
        </div>

        {/* No Manipulation */}
        <div>
          <label className="fc-zone-toggle">
            <input type="checkbox" checked={!!ethics?.noManipulation} onChange={(e) => updateEthics("noManipulation", e.target.checked)} className="fc-zone-toggle__input" />
            <span className="fc-zone-toggle__label">No software manipulation</span>
          </label>
          {!ethics?.noManipulation && (
            <div className="fc-zone-field fc-zone-field--indent">
              <VoiceInput value={ethics?.manipulationDetails || ""} onChange={(v) => updateEthics("manipulationDetails", v)} placeholder="Describe manipulation (e.g., composite, object removal)" />
            </div>
          )}
        </div>

        {/* No Staging */}
        <div>
          <label className="fc-zone-toggle">
            <input type="checkbox" checked={!!ethics?.noStaging} onChange={(e) => updateEthics("noStaging", e.target.checked)} className="fc-zone-toggle__input" />
            <span className="fc-zone-toggle__label">No staging or direction</span>
          </label>
          {!ethics?.noStaging && (
            <div className="fc-zone-field fc-zone-field--indent">
              <select value={String(ethics?.stagingDetails || "")} onChange={(e) => updateEthics("stagingDetails", e.target.value)} className="fc-zone-field__select">
                <option value="">Select staging method...</option>
                <option value="arranged-scene">Arranged scene</option>
                <option value="composite-scene">Composite scene</option>
                <option value="directed-poses">Directed poses</option>
                <option value="reenactment">Reenactment</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
        </div>

        {/* Informed Consent */}
        <div>
          <label className="fc-zone-toggle">
            <input type="checkbox" checked={!!ethics?.informedConsent} onChange={(e) => updateEthics("informedConsent", e.target.checked)} className="fc-zone-toggle__input" />
            <span className="fc-zone-toggle__label">Informed consent obtained</span>
          </label>
          {ethics?.informedConsent && (
            <div className="fc-zone-field fc-zone-field--indent">
              <select value={String(ethics?.consentDetails || "")} onChange={(e) => updateEthics("consentDetails", e.target.value)} className="fc-zone-field__select">
                <option value="">Select consent type...</option>
                <option value="guardian">Guardian consent (minor)</option>
                <option value="implied">Implied consent (public event)</option>
                <option value="verbal">Verbal consent</option>
                <option value="written">Written consent</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
        </div>

        {/* Identity Protected */}
        <div>
          <label className="fc-zone-toggle">
            <input type="checkbox" checked={!!ethics?.identityProtected} onChange={(e) => updateEthics("identityProtected", e.target.checked)} className="fc-zone-toggle__input" />
            <span className="fc-zone-toggle__label">Identity protection applied</span>
          </label>
          {ethics?.identityProtected && (
            <div className="fc-zone-field fc-zone-field--indent">
              <select value={String(ethics?.identityProtectionDetails || "")} onChange={(e) => updateEthics("identityProtectionDetails", e.target.value)} className="fc-zone-field__select">
                <option value="">Select protection method...</option>
                <option value="black-bar">Black bar over eyes</option>
                <option value="blur">Blur/pixelation</option>
                <option value="cropped">Cropped from frame</option>
                <option value="silhouette">Silhouette/shadow</option>
                <option value="other">Other method</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
