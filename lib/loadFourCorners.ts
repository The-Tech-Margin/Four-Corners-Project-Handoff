const FC_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/four-corners/fourcorners.js@main/dist";

let loaded = false;

export async function loadFourCorners(): Promise<void> {
  if (loaded) return;

  // Load CSS
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${FC_CDN_BASE}/fourcorners.min.css`;
  document.head.appendChild(link);

  // Load JS
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${FC_CDN_BASE}/fourcorners.min.js`;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });

  loaded = true;
}
