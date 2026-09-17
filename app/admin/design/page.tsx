/**
 * Admin Design tab — palette CRUD for persona colour schemes.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useCallback, useState } from "react";
import { PaletteList } from "@/components/admin/palette-list";
import { PaletteEditor } from "@/components/admin/palette-editor";
import type { PersonaPalette } from "@/lib/persona";

type View = "list" | "edit";

export default function AdminDesignPage() {
  const [view, setView] = useState<View>("list");
  const [editPalette, setEditPalette] = useState<PersonaPalette | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEdit = useCallback((palette: PersonaPalette) => {
    setEditPalette(palette);
    setView("edit");
  }, []);

  const handleNew = useCallback(() => {
    setEditPalette(null);
    setView("edit");
  }, []);

  const handleSave = useCallback(() => {
    setView("list");
    setEditPalette(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCancel = useCallback(() => {
    setView("list");
    setEditPalette(null);
  }, []);

  return (
    <div>
      <h2
        className="text-base font-semibold mb-4"
        style={{ color: "var(--fc-text)" }}
      >
        Palette Admin
      </h2>

      {view === "list" ? (
        <PaletteList
          onEdit={handleEdit}
          onNew={handleNew}
          refreshKey={refreshKey}
        />
      ) : (
        <PaletteEditor
          palette={editPalette}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
