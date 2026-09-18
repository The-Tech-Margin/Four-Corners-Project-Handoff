"use client";

import { useState, useCallback } from "react";
import { CANVAS_PRESETS, getPreset } from "./presets";
import { Type, Mic, ImageIcon, LinkIcon, MapPin, FormInput, Network } from "lucide-react";
import type { AutosaveStatus } from "@/hooks/useAutosave";
import { useFourCornersStore } from "@/lib/store";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface SketchboardToolbarProps {
  autosaveStatus: AutosaveStatus;
  lastAutosaveError: string | null;
  onSwitchToForm: () => void;
  onExport: () => void;
  onPresetSwitch: (presetId: string) => void;
  onVoiceRecord: () => void;
  onImageUpload: () => void;
  onInsertShape: (type: string) => void;
  /** Tree layout toggle (optional — only wired in the 2D sketchboard) */
  treeLayout?: boolean;
  onToggleTreeLayout?: () => void;
}

export function SketchboardToolbar({
  autosaveStatus,
  lastAutosaveError,
  onSwitchToForm,
  onExport,
  onPresetSwitch,
  onVoiceRecord,
  onImageUpload,
  onInsertShape,
  treeLayout,
  onToggleTreeLayout,
}: SketchboardToolbarProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const location = useFourCornersStore((s) => s.location);

  const handlePresetSwitch = useCallback(
    (presetId: string) => {
      if (activePreset === presetId) return;
      setPendingPreset(presetId);
    },
    [activePreset],
  );

  const confirmPresetSwitch = useCallback(() => {
    if (!pendingPreset) return;
    setActivePreset(pendingPreset);
    onPresetSwitch(pendingPreset);
    setPendingPreset(null);
  }, [pendingPreset, onPresetSwitch]);

  const statusText =
    autosaveStatus === "saving"
      ? "Saving..."
      : autosaveStatus === "saved"
        ? "Saved"
        : autosaveStatus === "error"
          ? "Error"
          : autosaveStatus === "waiting"
            ? "Unsaved"
            : "";

  const statusColor =
    autosaveStatus === "saved"
      ? "var(--fc-accent)"
      : autosaveStatus === "error"
        ? "var(--fc-danger)"
        : "var(--fc-text-muted)";

  return (
    <>
      {/* Desktop toolbar */}
      <div className="sketchboard-toolbar sketchboard-toolbar--desktop">
        {/* Left: preset selector */}
        <div className="fc-view-tabs__bar">
          {CANVAS_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePresetSwitch(p.id)}
              className={`fc-view-tabs__btn ${activePreset === p.id ? "fc-view-tabs__btn--active" : ""}`}
              title={p.description}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Center: shape insertion */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => onInsertShape("text-block")}
            className="sketchboard-toolbar__btn"
            title="Add text block"
          >
            <Type size={16} />
          </button>
          <button
            onClick={onVoiceRecord}
            className="sketchboard-toolbar__btn"
            title="Record voice note"
          >
            <Mic size={16} />
          </button>
          <button
            onClick={onImageUpload}
            className="sketchboard-toolbar__btn"
            title="Add image"
          >
            <ImageIcon size={16} />
          </button>
          <button
            onClick={() => onInsertShape("link-card")}
            className="sketchboard-toolbar__btn"
            title="Add link"
          >
            <LinkIcon size={16} />
          </button>

          {onToggleTreeLayout && (
            <button
              onClick={onToggleTreeLayout}
              className={`sketchboard-toolbar__btn${treeLayout ? " sketchboard-toolbar__btn--active" : ""}`}
              title={treeLayout ? "Switch to grid layout" : "Switch to tree layout"}
              aria-pressed={treeLayout}
            >
              <Network size={16} />
            </button>
          )}
        </div>

        {/* Right: status + actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {location?.formattedLocation && (
            <span
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--fc-text-faint)" }}
              title={`${location.latitude}, ${location.longitude}`}
            >
              <MapPin size={12} />
              <span className="hidden sm:inline">{location.formattedLocation}</span>
            </span>
          )}

          {statusText && (
            <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>
              {statusText}
            </span>
          )}

          <button onClick={onExport} className="sketchboard-toolbar__btn" title="Export">
            Export
          </button>

          <button
            onClick={onSwitchToForm}
            className="sketchboard-toolbar__btn"
            title="Switch to form editor"
          >
            <FormInput size={16} />
          </button>
        </div>
      </div>

      {/* Mobile toolbar */}
      <div className="sketchboard-toolbar sketchboard-toolbar--mobile">
        <button
          onClick={() => onInsertShape("text-block")}
          className="sketchboard-toolbar__btn"
          title="Text"
        >
          <Type size={20} />
        </button>
        <button onClick={onVoiceRecord} className="sketchboard-toolbar__btn" title="Voice">
          <Mic size={20} />
        </button>
        <button onClick={onImageUpload} className="sketchboard-toolbar__btn" title="Image">
          <ImageIcon size={20} />
        </button>
        <button
          onClick={() => onInsertShape("link-card")}
          className="sketchboard-toolbar__btn"
          title="Link"
        >
          <LinkIcon size={20} />
        </button>
        <button onClick={onSwitchToForm} className="sketchboard-toolbar__btn" title="Form">
          <FormInput size={20} />
        </button>
      </div>

      {/* Preset switch confirmation */}
      <ConfirmDialog
        isOpen={!!pendingPreset}
        onClose={() => setPendingPreset(null)}
        onConfirm={confirmPresetSwitch}
        title="Switch layout?"
        message={`Switch to ${pendingPreset ? getPreset(pendingPreset).label : ""}? Your metadata is saved — only the canvas layout changes.`}
        confirmText="Switch"
      />
    </>
  );
}
