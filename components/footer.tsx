"use client";

export function Footer() {
  return (
    <footer
      id="footer"
      className="mt-auto pt-3 pb-3 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-transparent scroll-mt-20"
      style={{
        borderImageSource:
          "linear-gradient(to right, transparent, color-mix(in srgb, var(--fc-accent) 50%, transparent), transparent)",
        borderImageSlice: 1,
      }}
    />
  );
}
