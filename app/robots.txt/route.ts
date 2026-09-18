/**
 * robots.txt — built from the configured site origin.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { GENERATOR, siteUrl } from "@/lib/attribution";

const SOCIAL_BOTS = [
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "Slackbot",
  "Discordbot",
];

export function GET(): Response {
  const site = siteUrl();
  const body = [
    `# ${GENERATOR}`,
    "",
    "# Default policy — public discovery routes only.",
    "User-agent: *",
    "Allow: /",
    "Allow: /gallery",
    "Allow: /share/*",
    "Allow: /p/*",
    "Allow: /view/*",
    "Allow: /about",
    "",
    "# Block private + machine routes",
    "Disallow: /api/",
    "Disallow: /dashboard",
    "Disallow: /auth/",
    "Disallow: /.env",
    "Disallow: /.git",
    "",
    "# Social preview bots — explicitly allowed so link cards work.",
    ...SOCIAL_BOTS.flatMap((bot) => [`User-agent: ${bot}`, "Allow: /", ""]),
    `Sitemap: ${site}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
