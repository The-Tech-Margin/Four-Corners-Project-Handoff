"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useFourCornersStore } from "@/lib/store";
import { VoiceTextarea } from "@/components/voice-textarea";
import { VoiceInput } from "@/components/voice-input";
import { AudioFileUpload } from "@/components/audio-file-upload";
import {
  CORNER_LABELS,
  CORNER_DESCRIPTIONS,
  CORNER_COLORS_CSS,
} from "./shapes/types";
import type { CornerAffinity } from "./shapes/types";
import { useSwipeToDismiss } from "@/hooks/use-swipe-dismiss";
import { isVideoUrl } from "@/lib/media-utils";

interface ZonePanelProps {
  zone: CornerAffinity;
  onClose: () => void;
}

export function ZonePanel({ zone, onClose }: ZonePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useSwipeToDismiss(panelRef, onClose);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => window.addEventListener("mousedown", handler), 100);
    return () => { clearTimeout(timer); window.removeEventListener("mousedown", handler); };
  }, [onClose]);

  if (!zone) return null;

  const label = CORNER_LABELS[zone] || zone.toUpperCase();
  const desc = CORNER_DESCRIPTIONS[zone] || "";
  const accent = CORNER_COLORS_CSS[zone] || "var(--fc-accent)";

  return (
    <div
      ref={panelRef}
      className="fc-zone-panel"
      style={{ "--zone-accent": accent } as React.CSSProperties}
    >
      <div className="fc-panel-handle" />
      <div className="fc-zone-panel__header">
        <div className="fc-zone-panel__title">
          <span className="fc-zone-panel__dot" style={{ background: accent }} />
          <span>{label}</span>
        </div>
        <span className="fc-zone-panel__desc">{desc}</span>
        <button onClick={onClose} className="fc-zone-panel__close" aria-label="Close panel">
          <X size={18} />
        </button>
      </div>

      <div className="fc-zone-panel__body">
        {zone === "backstory" && <BackstoryPanel />}
        {zone === "cc" && <AuthorshipPanel />}
        {zone === "context" && <ImageryPanel />}
        {zone === "links" && <LinksPanel />}
      </div>
    </div>
  );
}

/* ── Canvas-native editors with voice record + audio upload ── */

function BackstoryPanel() {
  const backStory = useFourCornersStore((s) => s.backStory);
  const update = useFourCornersStore((s) => s.updateBackStory);

  return (
    <div className="fc-zone-fields">
      <div className="fc-zone-field">
        <span className="fc-zone-field__label">Story</span>
        <VoiceTextarea
          value={backStory?.text || ""}
          onChange={(v) => update("text", v)}
          placeholder="What's the story behind this image?"
          rows={4}
          fieldId="backstory-text"
        />
        <AudioFileUpload
          fieldId="backstory-text"

          compact
          onTranscriptionComplete={(text) => {
            const prev = backStory?.text || "";
            update("text", prev ? `${prev}\n\n${text}` : text);
          }}
        />
      </div>

      <div className="fc-zone-field__row">
        <div className="fc-zone-field fc-zone-field--half">
          <span className="fc-zone-field__label">Photographer</span>
          <VoiceInput
            value={backStory?.author || ""}
            onChange={(v) => update("author", v)}
            placeholder="Name"
  
          />
        </div>
        <div className="fc-zone-field fc-zone-field--half">
          <span className="fc-zone-field__label">Date</span>
          <input
            type="date"
            value={backStory?.date || ""}
            onChange={(e) => update("date", e.target.value)}
            className="fc-zone-field__input"
          />
        </div>
      </div>

      <div className="fc-zone-field__row">
        <div className="fc-zone-field fc-zone-field--half">
          <span className="fc-zone-field__label">Publication</span>
          <VoiceInput
            value={backStory?.publication || ""}
            onChange={(v) => update("publication", v)}
            placeholder="Outlet / org"
  
          />
        </div>
        <div className="fc-zone-field fc-zone-field--half">
          <span className="fc-zone-field__label">URL</span>
          <input
            value={backStory?.publicationUrl || ""}
            onChange={(e) => update("publicationUrl", e.target.value)}
            placeholder="https://..."
            className="fc-zone-field__input"
          />
        </div>
      </div>
    </div>
  );
}

function AuthorshipPanel() {
  const cc = useFourCornersStore((s) => s.creativeCommons);
  const updateCC = useFourCornersStore((s) => s.updateCreativeCommons);
  const photo = useFourCornersStore((s) => s.photographerInfo);
  const updatePhoto = useFourCornersStore((s) => s.updatePhotographerInfo);
  const ethics = useFourCornersStore((s) => s.ethics);
  const updateEthics = useFourCornersStore((s) => s.updateEthics);

  // Derive photographer name and license from copyright string (mirrors form logic)
  const copyrightStr = cc?.copyright || "";
  const deriveLicense = () => {
    if (copyrightStr.includes("CC BY-NC 4.0")) return "cc-by-nc";
    if (copyrightStr.includes("CC BY-ND 4.0")) return "cc-by-nd";
    if (copyrightStr.includes("CC BY 4.0")) return "cc-by";
    if (copyrightStr.includes("CC0")) return "cc0";
    return "arr";
  };
  const derivePhotographer = () => {
    const dashMatch = copyrightStr.match(/— (.+)$/);
    if (dashMatch?.[1]) return dashMatch[1].trim();
    if (!copyrightStr.includes("CC") && !copyrightStr.includes("Public Domain")) {
      const legacyMatch = copyrightStr.match(/^Photograph by (.+?)( ©|$)/);
      return legacyMatch?.[1]?.trim() || copyrightStr.trim();
    }
    return "";
  };

  const updateCopyright = (name: string, lic: string) => {
    const text: Record<string, string> = {
      arr: name,
      "cc-by": name ? `CC BY 4.0 — ${name}` : "CC BY 4.0",
      "cc-by-nc": name ? `CC BY-NC 4.0 — ${name}` : "CC BY-NC 4.0",
      "cc-by-nd": name ? `CC BY-ND 4.0 — ${name}` : "CC BY-ND 4.0",
      cc0: name ? `CC0 (Public Domain) — ${name}` : "CC0 (Public Domain)",
    };
    updateCC("copyright", text[lic] || name);
  };

  const photographer = derivePhotographer();
  const license = deriveLicense();

  return (
    <div className="fc-zone-fields">
      <div className="fc-zone-field">
        <span className="fc-zone-field__label">Caption</span>
        <VoiceTextarea
          value={cc?.description || ""}
          onChange={(v) => updateCC("description", v)}
          placeholder="Describe what the viewer sees..."
          rows={3}
          fieldId="caption-description"
        />
        <AudioFileUpload
          fieldId="caption-description"

          compact
          onTranscriptionComplete={(text) => {
            const prev = cc?.description || "";
            updateCC("description", prev ? `${prev}\n\n${text}` : text);
          }}
        />
      </div>

      <div className="fc-zone-field">
        <span className="fc-zone-field__label">Credit & Copyright</span>
        <VoiceInput
          value={photographer}
          onChange={(v) => updateCopyright(v, license)}
          placeholder="Photographer / Agency"

        />
        <select
          value={license}
          onChange={(e) => updateCopyright(photographer, e.target.value)}
          className="fc-zone-field__select"
        >
          <option value="arr">All Rights Reserved</option>
          <option value="cc0">CC0 (Public Domain)</option>
          <option value="cc-by">CC BY 4.0</option>
          <option value="cc-by-nc">CC BY-NC 4.0</option>
          <option value="cc-by-nd">CC BY-ND 4.0</option>
        </select>
      </div>

      <div className="fc-zone-field__divider" />

      <div className="fc-zone-field__row">
        <div className="fc-zone-field fc-zone-field--half">
          <span className="fc-zone-field__label">Bio</span>
          <VoiceInput
            value={photo?.bio || ""}
            onChange={(v) => updatePhoto("bio", v)}
            placeholder="About the photographer"
  
          />
        </div>
        <div className="fc-zone-field fc-zone-field--half">
          <span className="fc-zone-field__label">Website</span>
          <input
            value={photo?.website || ""}
            onChange={(e) => updatePhoto("website", e.target.value)}
            placeholder="https://..."
            type="url"
            className="fc-zone-field__input"
          />
        </div>
      </div>

      <div className="fc-zone-field__row">
        <div className="fc-zone-field fc-zone-field--half">
          <span className="fc-zone-field__label">Contact</span>
          <VoiceInput
            value={photo?.contact || ""}
            onChange={(v) => updatePhoto("contact", v)}
            placeholder="Email or phone"
  
          />
        </div>
        <div className="fc-zone-field fc-zone-field--half">
          <span className="fc-zone-field__label">Collaborators</span>
          <VoiceInput
            value={photo?.collaborators || ""}
            onChange={(v) => updatePhoto("collaborators", v)}
            placeholder="Contributors"
  
          />
        </div>
      </div>

      <div className="fc-zone-field__divider" />
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
          fieldId="ethics-custom-text"
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

function ImageryPanel() {
  const context = useFourCornersStore((s) => s.context);
  const addContext = useFourCornersStore((s) => s.addContext);
  const removeContext = useFourCornersStore((s) => s.removeContext);
  const updateContext = useFourCornersStore((s) => s.updateContext);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      addContext({
        src: reader.result as string,
        caption: "",
        type: file.type.startsWith("video/") ? "video" : "image",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [addContext]);

  return (
    <div className="fc-zone-fields">
      <button onClick={() => fileRef.current?.click()} className="fc-zone-add-btn">
        <Plus size={14} />
        Add image or video
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,.heic,.heif"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      {context?.length ? (
        <div className="fc-zone-media-grid">
          {context.map((item, i) => (
            <div key={item.id || i} className="fc-zone-media-item">
              {item.src ? (
                item.type === "video" || isVideoUrl(item.src) ? (
                  <video
                    src={item.src}
                    className="fc-zone-media-item__img"
                    controls
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <img src={item.src} alt={item.caption || ""} className="fc-zone-media-item__img" />
                )
              ) : (
                <div className="fc-zone-media-item__placeholder" />
              )}
              <input
                value={item.caption || ""}
                onChange={(e) => updateContext(i, { caption: e.target.value })}
                placeholder="Caption..."
                className="fc-zone-field__input fc-zone-media-item__caption"
              />
              <input
                value={item.description || ""}
                onChange={(e) => updateContext(i, { description: e.target.value })}
                placeholder="Description..."
                className="fc-zone-field__input fc-zone-media-item__caption"
              />
              <input
                value={item.credit || ""}
                onChange={(e) => updateContext(i, { credit: e.target.value })}
                placeholder="Credit..."
                className="fc-zone-field__input fc-zone-media-item__caption"
              />
              <input
                type="date"
                value={item.date || ""}
                onChange={(e) => updateContext(i, { date: e.target.value })}
                className="fc-zone-field__input fc-zone-media-item__caption"
              />
              <button
                onClick={() => removeContext(i)}
                className="fc-zone-media-item__remove"
                aria-label="Remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="fc-zone-empty">No images yet</p>
      )}
    </div>
  );
}

function LinksPanel() {
  const links = useFourCornersStore((s) => s.links);
  const addLink = useFourCornersStore((s) => s.addLink);
  const removeLink = useFourCornersStore((s) => s.removeLink);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const handleAdd = useCallback(() => {
    if (!url.trim()) return;
    addLink({ title: title.trim(), url: url.trim(), source: "" });
    setTitle("");
    setUrl("");
  }, [title, url, addLink]);

  return (
    <div className="fc-zone-fields">
      <div className="fc-zone-link-input">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="fc-zone-field__input"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="fc-zone-field__input"
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <button onClick={handleAdd} className="fc-zone-add-btn fc-zone-add-btn--sm" disabled={!url.trim()}>
          <Plus size={14} />
        </button>
      </div>

      {links?.length ? (
        <div className="fc-zone-link-list">
          {links.map((link, i) => (
            <div key={i} className="fc-zone-link-item">
              <div className="fc-zone-link-item__text">
                <span className="fc-zone-link-item__title">{link.title || link.url}</span>
                {link.title && <span className="fc-zone-link-item__url">{link.url}</span>}
              </div>
              <button
                onClick={() => removeLink(i)}
                className="fc-zone-media-item__remove"
                aria-label="Remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="fc-zone-empty">No links yet</p>
      )}
    </div>
  );
}
