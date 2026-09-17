"use client";

import { useState } from "react";
import {BetaBadge } from "@/components/beta-badge";

export function InfoPanel() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-6 mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 rounded-lg bg-surface/50 hover:bg-surface transition-colors text-left border border-border/30"
        aria-expanded={isExpanded}
        aria-label="About this tool"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            About this tool
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-3 p-4 rounded-lg bg-surface border border-border/30 space-y-4">
          {/* beta Warning */}
          <BetaBadge variant="expanded" />

          {/* About */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">
              Four Corners Metadata Editor
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              A metadata entry tool for photographers following the precepts of
              the{" "}
              <a
                href="https://fourcornersproject.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-corner-backstory hover:underline"
              >
                Four Corners Project
              </a>{" "}
              standards conceived by Fred Ritchin.
            </p>
          </div>

          {/* Getting Started */}
          <div className="pt-2 border-t border-border/30">
            <h4 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-corner-backstory"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
              </svg>
              Getting Started
            </h4>
            <ol className="text-xs text-gray-500 leading-relaxed space-y-2">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-corner-backstory/10 text-corner-backstory flex items-center justify-center text-[10px] font-semibold mt-0.5">
                  1
                </span>
                <span>
                  <strong className="text-gray-400">Upload Image:</strong> Click
                  or drag an image to the drop zone at the top
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-corner-context/10 text-corner-context flex items-center justify-center text-[10px] font-semibold mt-0.5">
                  2
                </span>
                <span>
                  <strong className="text-gray-400">Add Metadata:</strong> Fill
                  in authorship, credit, and ethical considerations
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-corner-links/10 text-corner-links flex items-center justify-center text-[10px] font-semibold mt-0.5">
                  3
                </span>
                <span>
                  <strong className="text-gray-400">Choose Mode:</strong> Select
                  Minimal, Standard, or Complete based on your needs
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-corner-creativeCommons/10 text-corner-creativeCommons flex items-center justify-center text-[10px] font-semibold mt-0.5">
                  4
                </span>
                <span>
                  <strong className="text-gray-400">Export:</strong> Save as
                  JSON or share your project via cloud save
                </span>
              </li>
            </ol>
          </div>

          {/* The Four Corners */}
          <div className="pt-2 border-t border-border/30">
            <h4 className="text-xs font-semibold text-gray-400 mb-2">
              The Four Corners
            </h4>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center gap-2 p-2 rounded bg-corner-backstory/5 border border-corner-backstory/20">
                <div className="w-2 h-2 rounded-sm bg-corner-backstory flex-shrink-0"></div>
                <div>
                  <p className="text-[11px] font-medium text-corner-backstory leading-tight">
                    backStory
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Context about how and why the image was made
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-corner-context/5 border border-corner-context/20">
                <div className="w-2 h-2 rounded-sm bg-corner-context flex-shrink-0"></div>
                <div>
                  <p className="text-[11px] font-medium text-corner-context leading-tight">
                    context
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Related images that provide additional perspective
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-corner-links/5 border border-corner-links/20">
                <div className="w-2 h-2 rounded-sm bg-corner-links flex-shrink-0"></div>
                <div>
                  <p className="text-[11px] font-medium text-corner-links leading-tight">
                    links
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    External resources and related content
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-corner-creativeCommons/5 border border-corner-creativeCommons/20">
                <div className="w-2 h-2 rounded-sm bg-corner-creativeCommons flex-shrink-0"></div>
                <div>
                  <p className="text-[11px] font-medium text-corner-creativeCommons leading-tight">
                    creativeCommons
                  </p>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Licensing and usage rights information
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="pt-2 border-t border-border/30">
            <h4 className="text-xs font-semibold text-gray-400 mb-2">
              Key Features
            </h4>
            <ul className="text-xs text-gray-500 leading-relaxed space-y-1.5">
              <li className="flex items-center gap-2">
                <svg
                  className="w-3 h-3 text-corner-backstory flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  <strong>Voice Recording:</strong> Record audio notes that
                  auto-transcribe using AI
                </span>
              </li>
              <li className="flex items-center gap-2">
                <svg
                  className="w-3 h-3 text-corner-context flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  <strong>Location Capture:</strong> Automatically detect or
                  manually set GPS coordinates
                </span>
              </li>
              <li className="flex items-center gap-2">
                <svg
                  className="w-3 h-3 text-corner-links flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  <strong>Cloud Sync:</strong> Sign in to save projects and
                  access from any device
                </span>
              </li>
              <li className="flex items-center gap-2">
                <svg
                  className="w-3 h-3 text-corner-creativeCommons flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  <strong>Public Sharing:</strong> Generate shareable links for
                  saved projects
                </span>
              </li>
            </ul>
          </div>

          {/* Storage Info */}
          <div className="pt-2 border-t border-border/30">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-mustard/5 border border-mustard/20">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="w-4 h-4 text-mustard"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-mustard mb-1">
                  Storage Options
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  <span className="font-medium text-gray-400">
                    Work locally:
                  </span>{" "}
                  Projects stored in browser only. Export JSON for backup.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed mt-1.5">
                  <span className="font-medium text-gray-400">Cloud save:</span>{" "}
                  Sign in (Menu) to sync across devices and share projects.
                </p>
              </div>
            </div>
          </div>

          {/* Credits & Contact */}
          <div className="pt-2 border-t border-border/30">
            <p className="text-xs text-gray-600 leading-relaxed mb-2">
              <span className="font-medium text-gray-500">
                This tool implementation:
              </span>{" "}
              Built by{" "}
              <a
                href="https://www.thetechmargin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-corner-backstory hover:underline"
              >
                TheTechMargin
              </a>
              .
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              <span className="font-medium text-gray-500">
                Feedback welcome:
              </span>{" "}
              <a
                href="mailto:sonia@thetechmargin.com"
                className="text-corner-backstory hover:underline"
              >
                sonia@thetechmargin.com
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
