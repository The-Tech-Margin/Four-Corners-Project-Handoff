"use client";

import { useRef, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useFourCornersStore } from "@/lib/store";
import { isVideoUrl } from "@/lib/media-utils";

export function ContextUploader() {
  const context = useFourCornersStore((s) => s.context);
  const addContext = useFourCornersStore((s) => s.addContext);
  const removeContext = useFourCornersStore((s) => s.removeContext);
  const updateContext = useFourCornersStore((s) => s.updateContext);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [addContext],
  );

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
