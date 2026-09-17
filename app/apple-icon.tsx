import { ImageResponse } from "next/og";

// Route segment config
export const runtime = "edge";

// Image metadata
export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

// Image generation
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: "#0a0a0a",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Top-left corner - Backstory (Cyan) */}
          <rect x="5" y="5" width="40" height="40" rx="4" fill="#09fff0" />

          {/* Top-right corner - Context (Purple) */}
          <rect x="55" y="5" width="40" height="40" rx="4" fill="#a855f7" />

          {/* Bottom-left corner - Links (Lime) */}
          <rect x="5" y="55" width="40" height="40" rx="4" fill="#84cc16" />

          {/* Bottom-right corner - Creative Commons (Orange) */}
          <rect x="55" y="55" width="40" height="40" rx="4" fill="#f97316" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
