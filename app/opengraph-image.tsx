import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicKey } from "@/lib/supabase/public-key";

export const runtime = "edge";

export const alt = "Four Corners Metadata Editor";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

/** Default corner colors — used when no global palette is set */
const DEFAULTS = {
  bg: "#0A0A0A",
  text: "#f3f4f6",
  textMuted: "#9ca3af",
  textFaint: "#6b7280",
  cornerBS: "#09fff0",
  cornerCX: "#a855f7",
  cornerLK: "#84cc16",
  cornerCC: "#f97316",
};

/** Try to load the global palette's dark overrides from Supabase */
async function getGlobalColors() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublicKey();
  if (!url || !key) return null;

  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from("persona_palettes")
      .select("dark_overrides")
      .eq("is_global", true)
      .maybeSingle();

    return data?.dark_overrides as Record<string, string> | null;
  } catch {
    return null;
  }
}

export default async function Image() {
  const overrides = await getGlobalColors();

  const bg = overrides?.["--fc-bg"] || DEFAULTS.bg;
  const text = overrides?.["--fc-text"] || DEFAULTS.text;
  const textMuted = overrides?.["--fc-text-muted"] || DEFAULTS.textMuted;
  const textFaint = overrides?.["--fc-text-faint"] || DEFAULTS.textFaint;
  const cornerBS = overrides?.["--fc-corner-backstory"] || DEFAULTS.cornerBS;
  const cornerCX = overrides?.["--fc-corner-context"] || DEFAULTS.cornerCX;
  const cornerLK = overrides?.["--fc-corner-links"] || DEFAULTS.cornerLK;
  const cornerCC = overrides?.["--fc-corner-cc"] || DEFAULTS.cornerCC;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
        }}
      >
        {/* Four Corners Grid Logo */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "60px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                backgroundColor: cornerCX,
                borderRadius: "16px",
                opacity: 0.85,
              }}
            />
            <div
              style={{
                width: "120px",
                height: "120px",
                backgroundColor: cornerBS,
                borderRadius: "16px",
                opacity: 0.85,
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                backgroundColor: cornerLK,
                borderRadius: "16px",
                opacity: 0.85,
              }}
            />
            <div
              style={{
                width: "120px",
                height: "120px",
                backgroundColor: cornerCC,
                borderRadius: "16px",
                opacity: 0.85,
              }}
            />
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: "72px",
            fontWeight: 700,
            color: text,
            marginBottom: "20px",
            letterSpacing: "-0.02em",
          }}
        >
          Four Corners
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "32px",
            color: textMuted,
            marginBottom: "60px",
          }}
        >
          Metadata Editor for Photojournalism
        </div>

        {/* Footer */}
        <div
          style={{
            fontSize: "20px",
            color: textFaint,
          }}
        >
          Transparent &amp; Ethical Photojournalism Standards
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
