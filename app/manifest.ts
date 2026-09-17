/**
 * PWA manifest. Lets the app install to home screen / dock with a
 * branded icon and standalone window chrome, and gives social / OS
 * surfaces a clean way to label it.
 */

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Four Corners Metadata Editor",
    short_name: "Four Corners",
    description:
      "Digital implementation of Fred Ritchin's Four Corners Project — enriching photojournalism with context, backstory, related imagery, and ethical documentation.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["photo", "productivity", "news"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
