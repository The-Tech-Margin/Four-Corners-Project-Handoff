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
    >
      <div className="space-y-2">
        <div
          className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-3 text-xs leading-relaxed"
          style={{ color: "var(--fc-text-muted)" }}
        >
          <span className="text-center sm:text-left font-normal">
            <span className="bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
              Founding Partner
            </span>{" "}
            <a
              href="https://wwlight.org"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold [word-spacing:-0.15em] bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
            >
              Writing With Light
            </a>
          </span>
          <span className="text-center sm:text-right">
            <span style={{ fontSize: "10px" }}>Built by</span>{" "}
            <a
              href="https://www.thetechmargin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-pacifico font-normal bg-gradient-to-r from-pink-500 via-fuchsia-500 to-teal-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity inline-block pb-1"
              style={{ lineHeight: "1.6" }}
            >
              TheTechMargin
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
