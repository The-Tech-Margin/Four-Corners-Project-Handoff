"use client";

import { useFourCornersStore } from "@/lib/store";
import { VoiceInput } from "@/components/voice-input";

export function LicenseSelector() {
  const cc = useFourCornersStore((s) => s.creativeCommons);
  const updateCC = useFourCornersStore((s) => s.updateCreativeCommons);

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
    </div>
  );
}
