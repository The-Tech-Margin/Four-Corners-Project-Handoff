import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
        }}
      >
        <svg
          width="32"
          height="32"
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
