/**
 * Four Corners Metadata Editor
 * Digital implementation of Fred Ritchin's Four Corners Project
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 * @see https://www.thetechmargin.com
 * @see https://fourcornersproject.org
 */

import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Pacifico } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "react-hot-toast";
import { Footer } from "@/components/footer";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { PageViewReporter } from "@/components/page-view-reporter";
import { PersonaProvider } from "@/components/persona-provider";
import { IssueReporterProvider } from "@/components/issue-reporter/IssueReporterProvider";
import { ImageProtection } from "@/components/image-protection";
import { HashAnchorSync } from "@/components/hash-anchor-sync";
import { AccessProvider } from "@/components/access-provider";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import { HelpLauncherProvider } from "@/components/help-launcher/HelpLauncherProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pacifico = Pacifico({
  weight: "400",
  variable: "--font-pacifico",
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
  title: "Four Corners Metadata Editor",
  description:
    "A digital tool for implementing Fred Ritchin's Four Corners Project framework—enriching photojournalism with context, ethics documentation, and transparency. Built by TheTechMargin to support visual storytelling with integrity.",
  keywords: [
    "Four Corners Project",
    "Fred Ritchin",
    "photojournalism",
    "metadata",
    "photography ethics",
    "visual journalism",
    "transparency",
    "context",
    "backstory",
    "Creative Commons",
    "TheTechMargin",
  ],
  authors: [
    { name: "supersonic", url: "https://twitter.com/supersonic" },
    { name: "TheTechMargin", url: "https://www.thetechmargin.com" },
  ],
  creator: "supersonic, TheTechMargin",
  publisher: "TheTechMargin",
  metadataBase: new URL("https://four-corners.thetechmargin.com"),
  openGraph: {
    title: "Four Corners Metadata Editor",
    description:
      "Digital implementation of Fred Ritchin's Four Corners Project—a framework for enriching photojournalism with context, backstory, related imagery, and ethical documentation. Built by @supersonic and TheTechMargin.",
    url: "https://four-corners.thetechmargin.com",
    siteName: "Four Corners Metadata Editor",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Four Corners Metadata Editor - Photojournalism with Context",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Four Corners Metadata Editor",
    description:
      "Digital tool for Fred Ritchin's Four Corners Project—enriching photojournalism with context, backstory, and transparency. By @supersonic & TheTechMargin.",
    site: "@TheTechMargin",
    creator: "@supersonic",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://four-corners.thetechmargin.com",
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
        {/* Preconnect to Supabase for faster image + data loads */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        )}
        {/* Blocking script: apply cached palette overrides before first paint
            to prevent flash of default theme colors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,k=d.classList.contains("light")?"fc-palette-light":"fc-palette-dark",o=sessionStorage.getItem(k)||localStorage.getItem(k);if(!o)return;var p=JSON.parse(o);for(var v in p)d.style.setProperty(v,p[v])}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pacifico.variable} antialiased min-h-screen flex flex-col`}
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
          <IssueReporterProvider />
        </Suspense>
        <ImageProtection />
        <HashAnchorSync />
        {/* Single app-wide auth/access source. The per-page header + project
            menu read from this instead of each running their own auth
            subscription + admin-status cache. */}
        <AccessProvider>
          {/* Site-wide maintenance notice (super-admin controlled). Renders
              nothing when disabled; when active it publishes --fc-banner-h so
              the fixed header + content below shift down by exactly its height. */}
          <MaintenanceBanner />
          <div
            className="flex-1"
            style={{ paddingTop: "var(--fc-banner-h, 0px)" }}
          >
            {children}
          </div>
          {/* Floating help launcher — FAB on editor + dashboard; reads the
              shared access context for auth/admin-gated entries. */}
          <HelpLauncherProvider />
        </AccessProvider>
        <Footer />
        <Analytics />
        {/* Vercel's SpeedInsights powers the dashboard Real Experience Score
            and log drains. WebVitalsReporter runs alongside, sending the same
            CWV metrics to /api/vitals → Supabase speed_insights for our admin. */}
        <SpeedInsights />
        <WebVitalsReporter />
        {/* PageViewReporter fires a lightweight pageview ingest on every client
            navigation → /api/analytics/pageview → Supabase page_views table. */}
        <Suspense>
          <PageViewReporter />
        </Suspense>
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
