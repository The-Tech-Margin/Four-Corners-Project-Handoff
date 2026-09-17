"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useFourCornersStore } from "@/lib/store";

export function LinkAdder() {
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
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
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
