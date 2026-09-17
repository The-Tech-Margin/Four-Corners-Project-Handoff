/**
 * Four Corners — structured photo metadata editor built on the
 * four-corners model (context, links, backstory, authorship & ethics).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 * @see https://www.thetechmargin.com
 * @see https://fourcornersproject.org
 */

import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Footer } from "@/components/footer";
import { PersonaProvider } from "@/components/persona-provider";
import { ImageProtection } from "@/components/image-protection";
import { HashAnchorSync } from "@/components/hash-anchor-sync";
import { AccessProvider } from "@/components/access-provider";
import { CapabilitiesProvider } from "@/components/capabilities-provider";
import { HelpLauncherProvider } from "@/components/help-launcher/HelpLauncherProvider";
import { ATTRIBUTION, GENERATOR, siteUrl } from "@/lib/attribution";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  applicationName: ATTRIBUTION.product,
  title: "Four Corners",
  description:
    "Structured photo metadata editor built on the four-corners model: context, links, backstory, and authorship & ethics, plus location, camera metadata and voice notes.",
  keywords: [
    "four corners",
    "photojournalism",
    "metadata",
    "photography ethics",
    "visual journalism",
    "transparency",
    "context",
    "backstory",
    "Creative Commons",
    "IIIF",
  ],
  authors: [{ name: ATTRIBUTION.name, url: ATTRIBUTION.url }],
  creator: ATTRIBUTION.name,
  publisher: ATTRIBUTION.name,
  generator: GENERATOR,
  openGraph: {
    title: "Four Corners",
    description:
      "Document a photograph with context, links, backstory, and authorship & ethics — then publish, share and export it.",
    url: siteUrl(),
    siteName: "Four Corners",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Four Corners — photography with context",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: siteUrl(),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script: apply cached palette overrides before first paint
            to prevent flash of default theme colors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,k=d.classList.contains("light")?"fc-palette-light":"fc-palette-dark",o=sessionStorage.getItem(k)||localStorage.getItem(k);if(!o)return;var p=JSON.parse(o);for(var v in p)d.style.setProperty(v,p[v])}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        {/* Skip-to-main link — visible on Tab focus, lets keyboard + screen-
            reader users jump past the global header straight into the editor. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100000] focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-[var(--fc-surface)] focus:text-[var(--fc-text)] focus:border focus:border-[var(--fc-accent)] focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <Suspense>
          <PersonaProvider />
        </Suspense>
        <ImageProtection />
        <HashAnchorSync />
        {/* Single app-wide auth/access source. The per-page header + project
            menu read from this instead of each running their own auth
            subscription. */}
        <AccessProvider>
          <CapabilitiesProvider>
            <div className="flex-1">{children}</div>
          {/* Floating help launcher — FAB on editor + dashboard; reads the
              shared access context for auth-gated entries. */}
            <HelpLauncherProvider />
          </CapabilitiesProvider>
        </AccessProvider>
        <Footer />
        <Toaster
          position="top-center"
          containerClassName="!z-[99999]"
          containerStyle={{
            top: "50%",
            transform: "translateY(-50%)",
          }}
          toastOptions={{
            duration: 3000,
            style: {
              background: "var(--fc-surface)",
              color: "var(--fc-text)",
              border: "1px solid var(--fc-border)",
              borderRadius: "9px",
              padding: "12px 16px",
              fontSize: "14px",
              maxWidth: "90vw",
            },
            success: {
              iconTheme: {
                primary: "#10b981",
                secondary: "#ffffff",
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: "#ef4444",
                secondary: "#ffffff",
              },
            },
          }}
        />
      </body>
    </html>
  );
}
