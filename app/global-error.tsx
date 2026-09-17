"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches errors that occur in root layout.tsx itself.
 * Must render its own <html> and <body> since the root layout may have failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1a1a",
          color: "#e5e5e5",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        {/* Inline Four Corners animation — can't use globals.css here */}
        <style>{`
          @keyframes ge-scatter {
            0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
            25% { transform: translate(var(--dx), var(--dy)) rotate(45deg); opacity: 0.5; }
            50% { transform: translate(calc(var(--dx) * -0.5), calc(var(--dy) * -0.5)) rotate(-30deg); opacity: 0.7; }
            75% { transform: translate(calc(var(--dx) * 0.3), calc(var(--dy) * 0.3)) rotate(15deg); opacity: 0.6; }
          }
          @keyframes ge-glow {
            0%, 100% { opacity: 0; transform: scale(0.8); }
            50% { opacity: 0.3; transform: scale(1.2); }
          }
          .ge-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            width: 80px;
            height: 80px;
            margin-bottom: 32px;
            position: relative;
          }
          .ge-corner {
            border-radius: 4px;
            animation: ge-scatter 4s ease-in-out infinite;
          }
          .ge-corner--tl { background: #a855f7; --dx: -20px; --dy: -20px; animation-delay: 0s; }
          .ge-corner--tr { background: #84cc16; --dx: 20px; --dy: -20px; animation-delay: 0.2s; }
          .ge-corner--bl { background: #09fff0; --dx: -20px; --dy: 20px; animation-delay: 0.4s; }
          .ge-corner--br { background: #f97316; --dx: 20px; --dy: 20px; animation-delay: 0.6s; }
          .ge-glow {
            position: absolute;
            inset: -10px;
            border-radius: 12px;
            background: radial-gradient(circle, rgba(9,255,240,0.15) 0%, transparent 70%);
            animation: ge-glow 4s ease-in-out infinite;
            pointer-events: none;
          }
          .ge-btn {
            display: inline-block;
            padding: 12px 28px;
            border-radius: 9px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: background 0.2s, transform 0.1s;
          }
          .ge-btn:active { transform: scale(0.97); }
          .ge-btn--primary { background: #09fff0; color: #111; }
          .ge-btn--primary:hover { background: #07ccc0; }
          .ge-btn--secondary { background: #2d2d2d; color: #e5e5e5; border: 1px solid #3a3a3a; }
          .ge-btn--secondary:hover { background: #363636; }
        `}</style>

        <div className="ge-grid">
          <div className="ge-corner ge-corner--tl" />
          <div className="ge-corner ge-corner--tr" />
          <div className="ge-corner ge-corner--bl" />
          <div className="ge-corner ge-corner--br" />
          <div className="ge-glow" />
        </div>

        <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0 0 8px", color: "#f5f5f5" }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "1rem", color: "#888", margin: "0 0 8px", textAlign: "center", maxWidth: 440 }}>
          The corners scattered. We're piecing them back together.
        </p>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "#555", margin: "0 0 24px", fontFamily: "monospace" }}>
            Ref: {error.digest}
          </p>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <button className="ge-btn ge-btn--primary" onClick={reset}>
            Try again
          </button>
          <a className="ge-btn ge-btn--secondary" href="/">
            Go Home
          </a>
          <a className="ge-btn ge-btn--secondary" href="/gallery">
            Browse Gallery
          </a>
        </div>
      </body>
    </html>
  );
}
