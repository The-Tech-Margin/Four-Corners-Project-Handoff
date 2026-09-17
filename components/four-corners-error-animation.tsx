"use client";

import { useEffect, useState } from "react";

/**
 * Animated Four Corners logo for error/maintenance pages.
 *
 * The four corners orbit, scatter, and reassemble — visually conveying
 * "something fell apart but we're putting it back together."
 */
export function FourCornersErrorAnimation({
  variant = "error",
}: {
  variant?: "error" | "maintenance" | "not-found";
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const animClass =
    variant === "maintenance"
      ? "fc-err-anim--maintenance"
      : variant === "not-found"
        ? "fc-err-anim--notfound"
        : "fc-err-anim--error";

  return (
    <div
      className={`fc-err-anim ${animClass} ${mounted ? "fc-err-anim--mounted" : ""}`}
      aria-hidden="true"
    >
      {/* Corner: Context (top-left, purple) */}
      <div className="fc-err-anim__corner fc-err-anim__corner--tl">
        <div className="fc-err-anim__face" />
      </div>
      {/* Corner: Links (top-right, lime) */}
      <div className="fc-err-anim__corner fc-err-anim__corner--tr">
        <div className="fc-err-anim__face" />
      </div>
      {/* Corner: Backstory (bottom-left, cyan) */}
      <div className="fc-err-anim__corner fc-err-anim__corner--bl">
        <div className="fc-err-anim__face" />
      </div>
      {/* Corner: Authorship (bottom-right, orange) */}
      <div className="fc-err-anim__corner fc-err-anim__corner--br">
        <div className="fc-err-anim__face" />
      </div>
      {/* Center glow pulse */}
      <div className="fc-err-anim__glow" />
    </div>
  );
}
