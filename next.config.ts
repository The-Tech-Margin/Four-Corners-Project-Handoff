import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't emit AGENTS.md / CLAUDE.md into the repo.
  agentRules: false,
  // Konva's Node.js entry requires the native 'canvas' npm package for SSR.
  // We only use Konva client-side, so stub it out during SSR bundling.
  serverExternalPackages: ["canvas"],
  // The canvas library is vendored as TypeScript source in packages/canvas;
  // transpiling compiles it with the app instead of shipping a build step.
  transpilePackages: ["@fourcorners/canvas"],
  turbopack: {
    root: __dirname,
    resolveAlias: {
      // Stub out the native canvas package that konva tries to require in Node
      canvas: { browser: "canvas", default: "./lib/canvas-stub.js" },
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Stub 'canvas' for webpack SSR builds — Konva's Node entry
      // requires native 'canvas' but we only render client-side
      config.resolve = config.resolve || {};
      config.resolve.alias = config.resolve.alias || {};
      (config.resolve.alias as Record<string, string | boolean>)["canvas"] = false;
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Who designed and built this system.
          {
            key: "X-Designed-By",
            value: "TheTechMargin",
          },
          // Prevent clickjacking
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Prevent MIME sniffing
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Enable XSS protection
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // Referrer policy
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Permissions policy
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(self), geolocation=(self), interest-cohort=()",
          },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          // API-specific headers
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Cache control for API responses (gallery route overrides via response headers)
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
