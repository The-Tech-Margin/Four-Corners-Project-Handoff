"use client";

import { useState, useRef, useMemo } from "react";
import { useFourCornersStore } from "@/lib/store";
import { useAccess } from "@/components/access-provider";
import { notifyFile } from "@/lib/notify";
import { VoiceTextarea } from "@/components/voice-textarea";
import { VoiceInput } from "@/components/voice-input";
import { SectionHeader } from "@/components/section-header";
import { AssetLibraryModal } from "@/components/asset-library-modal";
import { Library, Upload } from "lucide-react";
import type { UserAsset } from "@/lib/field-registry";
import { validateUpload, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/upload-limits";
import { checkQuotaForUpload } from "@/lib/api-client/quota";

export function CaptionCreditEthics() {
  const { user } = useAccess();
  const {
    creativeCommons,
    ethics,
    photographerInfo,
    mode,
    consentDocuments,
    updateCreativeCommons,
    updateEthics,
    updatePhotographerInfo,
    addConsentDocument,
    removeConsentDocument,
  } = useFourCornersStore();
  // Known ethics code values that match dropdown options
  const ETHICS_CODE_VALUES = useMemo(() => [
    "As a staff member of Associated Press, I abide by AP's ethics code.",
    "As a documentary photographer, I strive to authentically represent the subjects and events I document. I do not stage scenes or digitally alter the content of my photographs in ways that misrepresent reality.",
    "As a fashion photographer, I do not photograph underweight models whose Body Mass Index is lower than that established as healthy by authorities.",
    "As a fine art photographer, I may alter my images in pursuit of my own artistic vision.",
    "This is an artistic image, allowing me to take liberties in altering the photograph. I do not alter my journalistic imagery.",
    "As a non-fiction photographer, my images are intended to truthfully represent real events, people, and places. I do not stage or fabricate scenes and any post-processing is limited to standard adjustments that do not alter the factual content of the image.",
    "While all photography is interpretive, as a photojournalist my photographs are meant to respect the visible facts of the situations I depict. I do not add or subtract elements to or from my photographs.",
    "As a sports photographer, I do not re-stage events.",
    "While on assignment for UNICEF, I abide by UNICEF's ethics code. I do not show the faces of children who are HIV-positive or who have been child soldiers.",
    "As a wildlife photographer, all my photographs depict animals in the wild unless otherwise specified.",
  ], []);

  // Derive initial license and photographer from stored copyright string
  const [photographer, setPhotographer] = useState(() => {
    const copyrightStr = creativeCommons.copyright;
    if (!copyrightStr) return "";
    const ccDashMatch = copyrightStr.match(/— (.+)$/);
    if (ccDashMatch && ccDashMatch[1]) return ccDashMatch[1].trim();
    if (!copyrightStr.includes("CC") && !copyrightStr.includes("Public Domain")) {
      const legacyMatch = copyrightStr.match(/^Photograph by (.+?)( ©|$)/);
      if (legacyMatch && legacyMatch[1]) return legacyMatch[1].trim();
      return copyrightStr.trim();
    }
    return "";
  });

  const [license, setLicense] = useState(() => {
    const copyrightStr = creativeCommons.copyright;
    if (!copyrightStr) return "arr";
    if (copyrightStr.includes("CC BY-NC 4.0")) return "cc-by-nc";
    if (copyrightStr.includes("CC BY-ND 4.0")) return "cc-by-nd";
    if (copyrightStr.includes("CC BY 4.0")) return "cc-by";
    if (copyrightStr.includes("CC0")) return "cc0";
    return "arr";
  });

  const [showSubjectProtection, setShowSubjectProtection] = useState(false);
  const [showEthicsDetails, setShowEthicsDetails] = useState(false);

  // Derive initial ethics code selection from stored custom ethics text
  const [useOwnEthics, setUseOwnEthics] = useState(() => {
    const existingText = ethics?.customEthicsText;
    return !!(existingText && !ETHICS_CODE_VALUES.includes(existingText));
  });

  const [selectedEthicsCode, setSelectedEthicsCode] = useState(() => {
    const existingText = ethics?.customEthicsText;
    if (!existingText) return "";
    if (ETHICS_CODE_VALUES.includes(existingText)) return existingText;
    return "__own__";
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [consentLibraryOpen, setConsentLibraryOpen] = useState(false);

  /**
   * Add one or more library assets as consent documents. Library docs are
   * already uploaded — we stash the stored URL in `dataUrl` so
   * the existing ConsentDocument shape keeps working without schema churn.
   */
  const handleConsentLibraryPick = (assets: UserAsset[]) => {
    for (const asset of assets) {
      addConsentDocument({
        name: asset.fileName,
        size: asset.fileSize ?? 0,
        type: asset.mimeType,
        dataUrl: asset.storageUrl,
        uploadedAt: new Date().toISOString(),
      });
    }
  };

  const updateCopyright = (newPhotographer: string, newLicense: string) => {
    const name = newPhotographer || "";
    const copyrightText = {
      arr: name,
      "cc-by": name ? `CC BY 4.0 — ${name}` : "CC BY 4.0",
      "cc-by-nc": name ? `CC BY-NC 4.0 — ${name}` : "CC BY-NC 4.0",
      "cc-by-nd": name ? `CC BY-ND 4.0 — ${name}` : "CC BY-ND 4.0",
      cc0: name ? `CC0 (Public Domain) — ${name}` : "CC0 (Public Domain)",
    }[newLicense];
    updateCreativeCommons("copyright", copyrightText || "");
  };

  const handlePhotographerChange = (value: string) => {
    setPhotographer(value);
    updateCopyright(value, license);
  };

  const handleLicenseChange = (value: string) => {
    setLicense(value);
    updateCopyright(photographer, value);
  };

  const handleConsentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      // Size check — shared module, 20 MB cap for documents.
      const sizeCheck = validateUpload(file, "document");
      if (!sizeCheck.ok) {
        notifyFile.tooLarge(
          sizeCheck.fileName,
          sizeCheck.actualBytes,
          sizeCheck.limitBytes,
          sizeCheck.kind,
        );
        continue;
      }

      // Quota check
      if (user) {
        const quota = await checkQuotaForUpload(file.size);
        if (!quota.ok) {
          notifyFile.quotaExceeded(quota.used, quota.limit, quota.plan);
          continue;
        }
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          addConsentDocument({
            name: file.name,
            size: file.size,
            type: file.type,
            dataUrl: event.target.result as string,
            uploadedAt: new Date().toISOString(),
          });
        }
      };
      reader.readAsDataURL(file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number | undefined): string => {
    if (typeof bytes !== "number" || isNaN(bytes) || bytes < 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <section className="mb-4 sm:mb-6">
      <SectionHeader
        title="Authorship"
        color="corner-creativeCommons"
        cornerLabel="creativeCommons · bottom-right"
        tooltipTitle="Authorship (Bottom Right)"
        tooltipContent="Here one writes: a short caption for the photograph, one's credit and copyright (or Creative Commons), a sentence or two explaining one's own code of ethics as a photographer, a short bio of oneself as the photographer, and also contact information for anyone who wants to get reproduction rights or a print."
      />

      <div className="bg-surface rounded-none sm:rounded-xl -mx-4 sm:mx-0 border border-border border-l-[5px] border-l-corner-creativeCommons p-3 sm:p-4 space-y-3 sm:space-y-4">
        <div>
          <label className="block text-xs text-gray-700 dark:text-gray-500 mb-1.5">
            Caption
          </label>
          <VoiceTextarea
            value={creativeCommons.description}
            onChange={(value) => updateCreativeCommons("description", value)}
            placeholder="Describe what's happening in this image..."
            ariaLabel="Image caption"
            rows={3}
            showCharCount={true}
            borderColor="border-border/40"
            fieldId="caption-description"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">
            Credit & Copyright
          </label>
          <div className="flex flex-col gap-3 sm:gap-2">
            <VoiceInput
              value={photographer}
              onChange={handlePhotographerChange}
              placeholder="Photographer / Agency"
              ariaLabel="Photographer name"
              className="w-full"
            />
            <select
              aria-label="License"
              value={license || "arr"}
              onChange={(e) => handleLicenseChange(e.target.value)}
              className="w-full bg-surface-alt rounded-lg px-3 py-2.5 text-sm text-gray-200 border border-border/40 focus:border-accent/50 focus:outline-none cursor-pointer h-[42px]"
            >
              <option value="arr">All Rights Reserved</option>
              <option value="cc0">CC0 (Public Domain)</option>
              <option value="cc-by">CC BY 4.0</option>
              <option value="cc-by-nc">CC BY-NC 4.0</option>
              <option value="cc-by-nd">CC BY-ND 4.0</option>
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-border/50">
          <p className="text-xs text-gray-700 dark:text-gray-500 mb-3 font-medium">
            About the Photographer
          </p>
          <div className="space-y-4 sm:space-y-3">
            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-500 mb-1.5">
                Photographer Bio
              </label>
              <VoiceTextarea
                value={photographerInfo?.bio || ""}
                onChange={(value) => updatePhotographerInfo("bio", value)}
                placeholder="Brief bio providing context (e.g., 'Indian-born photographer based in Mumbai covering labor rights')"
                ariaLabel="Photographer bio"
                rows={2}
                fieldId="photographer-bio"
              />
              <p className="text-xs text-gray-700 dark:text-gray-600 mt-1">
                Context about who you are can inform how viewers interpret your
                perspective
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-500 mb-1.5">
                Collaborators{" "}
                <span className="text-gray-700 dark:text-gray-600">
                  (optional)
                </span>
              </label>
              <VoiceInput
                value={photographerInfo?.collaborators || ""}
                onChange={(value) =>
                  updatePhotographerInfo("collaborators", value)
                }
                placeholder="Contributors, editors, or other collaborators on this work"
                ariaLabel="Collaborators"
              />
              <p className="text-xs text-gray-700 dark:text-gray-600 mt-1">
                Credit additional people who contributed to this photograph or
                story
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-500 mb-1.5">
                Contact Information{" "}
                <span className="text-gray-700 dark:text-gray-600">
                  (optional)
                </span>
              </label>
              <VoiceInput
                value={photographerInfo?.contact || ""}
                onChange={(value) => updatePhotographerInfo("contact", value)}
                type="email"
                placeholder="Email or other contact for licensing inquiries"
                ariaLabel="Contact information"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-700 dark:text-gray-500 mb-1.5">
                Photographer Website{" "}
                <span className="text-gray-700 dark:text-gray-600">
                  (optional)
                </span>
              </label>
              <VoiceInput
                value={photographerInfo?.website || ""}
                onChange={(value) => updatePhotographerInfo("website", value)}
                type="url"
                placeholder="https://yourportfolio.com"
                ariaLabel="Website URL"
              />
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-medium text-corner-creativeCommons">
              Software Use and Staging
            </p>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            Let readers know your practices — transparency builds credibility
          </p>

          <div className="mb-4 space-y-1.5">
            <label className="block text-xs text-gray-500">
              Suggested Codes of Ethics
            </label>
            <select
              aria-label="Suggested code of ethics"
              value={selectedEthicsCode}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedEthicsCode(val);
                if (val === "__own__") {
                  setUseOwnEthics(true);
                  updateEthics("customEthicsText", "");
                } else if (val) {
                  setUseOwnEthics(false);
                  updateEthics("customEthicsText", val);
                }
              }}
              className="w-full bg-surface-alt rounded-lg px-3 py-2.5 text-sm text-gray-200 border border-border/40 focus:border-accent/50 focus:outline-none cursor-pointer h-[42px]"
            >
              <option value="">Select a code of ethics...</option>
              <option value="As a staff member of Associated Press, I abide by AP's ethics code.">
                Associated Press
              </option>
              <option value="As a documentary photographer, I strive to authentically represent the subjects and events I document. I do not stage scenes or digitally alter the content of my photographs in ways that misrepresent reality.">
                Documentary Photographer
              </option>
              <option value="As a fashion photographer, I do not photograph underweight models whose Body Mass Index is lower than that established as healthy by authorities.">
                Fashion Photographer
              </option>
              <option value="As a fine art photographer, I may alter my images in pursuit of my own artistic vision.">
                Fine Art Photographer
              </option>
              <option value="This is an artistic image, allowing me to take liberties in altering the photograph. I do not alter my journalistic imagery.">
                Fine Art/Journalism
              </option>
              <option value="As a non-fiction photographer, my images are intended to truthfully represent real events, people, and places. I do not stage or fabricate scenes and any post-processing is limited to standard adjustments that do not alter the factual content of the image.">
                Non-Fiction Photographer
              </option>
              <option value="While all photography is interpretive, as a photojournalist my photographs are meant to respect the visible facts of the situations I depict. I do not add or subtract elements to or from my photographs.">
                Photojournalist
              </option>
              <option value="As a sports photographer, I do not re-stage events.">
                Sports Photographer
              </option>
              <option value="While on assignment for UNICEF, I abide by UNICEF's ethics code. I do not show the faces of children who are HIV-positive or who have been child soldiers.">
                UNICEF
              </option>
              <option value="As a wildlife photographer, all my photographs depict animals in the wild unless otherwise specified.">
                Wildlife Photographer
              </option>
              <option value="__own__">Other / Use My Own</option>
            </select>
            <p className="text-xs text-gray-600">
              Select a code to populate the field below, then edit as needed
            </p>

            <button
              onClick={() => setShowEthicsDetails(!showEthicsDetails)}
              className="mt-2 text-xs text-gray-500 hover:text-gray-400 transition-colors flex items-center gap-1"
            >
              {showEthicsDetails ? (
                <svg
                  className="w-3.5 h-3.5"
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
              ) : (
                <svg
                  className="w-3 h-3"
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
              )}
              {showEthicsDetails ? "Hide" : "View"} suggested codes of ethics
            </button>

            {showEthicsDetails && (
              <div className="mt-2 space-y-2 p-3 rounded-lg bg-surface-alt/50 border border-border/30">
                {[
                  {
                    role: "Photojournalist",
                    text: "While all photography is interpretive, as a photojournalist my photographs are meant to respect the visible facts of the situations I depict. I do not add or subtract elements to or from my photographs.",
                  },
                  {
                    role: "Fine Art Photographer",
                    text: "As a fine art photographer, I may alter my images in pursuit of my own artistic vision.",
                  },
                  {
                    role: "Fine Art/Journalism",
                    text: "This is an artistic image, allowing me to take liberties in altering the photograph. I do not alter my journalistic imagery.",
                  },
                  {
                    role: "Non-Fiction Photographer",
                    text: "As a non-fiction photographer, my images are intended to truthfully represent real events, people, and places. I do not stage or fabricate scenes and any post-processing is limited to standard adjustments that do not alter the factual content of the image.",
                  },
                  {
                    role: "Associated Press",
                    text: "As a staff member of Associated Press, I abide by AP\u2019s ethics code.",
                  },
                  {
                    role: "UNICEF",
                    text: "While on assignment for UNICEF, I abide by UNICEF\u2019s ethics code. I do not show the faces of children who are HIV-positive or who have been child soldiers.",
                  },
                  {
                    role: "Wildlife Photographer",
                    text: "As a wildlife photographer, all my photographs depict animals in the wild unless otherwise specified.",
                  },
                  {
                    role: "Fashion Photographer",
                    text: "As a fashion photographer, I do not photograph underweight models whose Body Mass Index is lower than that established as healthy by authorities.",
                  },
                  {
                    role: "Sports Photographer",
                    text: "As a sports photographer, I do not re-stage events.",
                  },
                  {
                    role: "Documentary Photographer",
                    text: "As a documentary photographer, I strive to authentically represent the subjects and events I document. I do not stage scenes or digitally alter the content of my photographs in ways that misrepresent reality.",
                  },
                ].map((item) => (
                  <div key={item.role} className="text-xs">
                    <p className="font-medium text-gray-400 mb-0.5">{item.role}</p>
                    <p className="text-gray-600 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500">
              Your Statement on Software Use and Staging
            </label>
            <VoiceTextarea
              value={ethics?.customEthicsText || ""}
              onChange={(value) => {
                updateEthics("customEthicsText", value);
                // Clear "use own" flag once user picks from dropdown again
                if (!useOwnEthics && value) setUseOwnEthics(false);
              }}
              placeholder={
                useOwnEthics
                  ? "Add your code of ethics."
                  : "Enter your personal or organization's ethical standards, or select from the dropdown above..."
              }
              ariaLabel="Custom ethics text"
              rows={4}
              fieldId="ethics-custom-text"
            />
            <p className="text-xs text-gray-600 flex items-start gap-1.5">
              <svg
                className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
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
              <span>
                You can edit any suggested code to fit your specific practices
              </span>
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {/* AI Altered - prominent toggle */}
            <div className="space-y-2 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={ethics?.aiAltered || false}
                  onChange={(e) =>
                    updateEthics("aiAltered", e.target.checked)
                  }
                  className="w-4 h-4 mt-0.5 flex-shrink-0 rounded bg-white dark:bg-surface-alt border-border text-purple-500 focus:ring-purple-500/30"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-300 group-hover:text-gray-200 flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-purple-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                      />
                    </svg>
                    AI-altered or AI-generated
                  </span>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Image was created or modified using AI/generative tools
                  </p>
                </div>
              </label>
              {ethics?.aiAltered && (
                <div className="pl-7">
                  <VoiceInput
                    value={ethics?.aiAlteredDetails || ""}
                    onChange={(value) =>
                      updateEthics("aiAlteredDetails", value)
                    }
                    placeholder="Describe AI tools used (e.g., Midjourney, DALL-E, Photoshop Generative Fill)"
                    ariaLabel="AI alteration details"
                  />
                </div>
              )}
            </div>

            {/* No manipulation toggle */}
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={ethics?.noManipulation || false}
                  onChange={(e) =>
                    updateEthics("noManipulation", e.target.checked)
                  }
                  className="w-4 h-4 mt-0.5 flex-shrink-0 rounded bg-white dark:bg-surface-alt border-border text-corner-creativeCommons focus:ring-corner-creativeCommons/30"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-300 group-hover:text-gray-200">
                    No software manipulation
                  </span>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Beyond standard processing (levels, color correction,
                    crop)
                  </p>
                </div>
              </label>
              {!ethics?.noManipulation && (
                <div className="pl-7">
                  <VoiceInput
                    value={ethics?.manipulationDetails || ""}
                    onChange={(value) =>
                      updateEthics("manipulationDetails", value)
                    }
                    placeholder="Describe manipulation (e.g., composite, object removal)"
                    ariaLabel="Manipulation details"
                  />
                </div>
              )}
            </div>

            {/* No staging toggle */}
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={ethics?.noStaging || false}
                  onChange={(e) =>
                    updateEthics("noStaging", e.target.checked)
                  }
                  className="w-4 h-4 mt-0.5 flex-shrink-0 rounded bg-white dark:bg-surface-alt border-border text-corner-creativeCommons focus:ring-corner-creativeCommons/30"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-300 group-hover:text-gray-200">
                    No staging or direction
                  </span>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Subjects not posed, arranged, or directed for the
                    photograph
                  </p>
                </div>
              </label>
              {!ethics?.noStaging && (
                <div className="pl-7">
                  <select
                    aria-label="Staging method"
                    value={String(ethics?.stagingDetails || "")}
                    onChange={(e) =>
                      updateEthics("stagingDetails", e.target.value)
                    }
                    className="w-full bg-white dark:bg-surface-alt rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-gray-300 border border-border/40 focus:border-accent/50 focus:outline-none cursor-pointer"
                  >
                    <option value="">Select staging method...</option>
                    <option value="arranged-scene">Arranged scene</option>
                    <option value="composite-scene">Composite scene</option>
                    <option value="directed-poses">Directed poses</option>
                    <option value="reenactment">Reenactment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <p className="text-xs text-corner-creativeCommons font-medium">
                Subject Protection
              </p>
              {mode === "minimal" && (
                <span className="text-xs text-gray-700 dark:text-gray-600 bg-surface-alt px-1.5 py-0.5 rounded">
                  Optional
                </span>
              )}
            </div>
            {mode === "minimal" && (
              <button
                onClick={() => setShowSubjectProtection(!showSubjectProtection)}
                className="text-xs text-gray-700 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors flex items-center gap-1"
              >
                <span>{showSubjectProtection ? "Hide" : "Show"}</span>
                <svg
                  className={`w-3 h-3 transition-transform ${
                    showSubjectProtection ? "rotate-180" : ""
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
            )}
          </div>
          <p className="text-[11px] text-gray-700 dark:text-gray-600 mb-3">
            For documenting consent and protecting vulnerable subjects
          </p>

          {(mode !== "minimal" || showSubjectProtection) && (
            <div className="space-y-2.5">
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={ethics?.informedConsent || false}
                    onChange={(e) =>
                      updateEthics("informedConsent", e.target.checked)
                    }
                    className="w-4 h-4 flex-shrink-0 rounded bg-white dark:bg-surface-alt border-border text-corner-creativeCommons focus:ring-corner-creativeCommons/30"
                  />
                  <div className="flex-1">
                    <span className="text-sm text-gray-900 dark:text-gray-300 group-hover:text-gray-800 dark:group-hover:text-gray-200">
                      Informed consent obtained
                    </span>
                    <p className="text-[11px] text-gray-700 dark:text-gray-600">
                      Subject aware of and agreed to publication use
                    </p>
                  </div>
                </label>
                {ethics?.informedConsent && (
                  <div className="pl-7">
                    <select
                      aria-label="Informed consent method"
                      value={String(ethics?.consentDetails || "")}
                      onChange={(e) =>
                        updateEthics("consentDetails", e.target.value)
                      }
                      className="w-full bg-white dark:bg-surface-alt rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-gray-300 border border-border/40 focus:border-accent/50 focus:outline-none cursor-pointer"
                    >
                      <option value="">Select consent type...</option>
                      <option value="guardian">Guardian consent (minor)</option>
                      <option value="implied">
                        Implied consent (public event)
                      </option>
                      <option value="verbal">Verbal consent</option>
                      <option value="written">Written consent</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                )}
              </div>

              {mode === "complete" && (
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={ethics?.identityProtected || false}
                      onChange={(e) =>
                        updateEthics("identityProtected", e.target.checked)
                      }
                      className="w-4 h-4 flex-shrink-0 rounded bg-white dark:bg-surface-alt border-border text-corner-creativeCommons focus:ring-corner-creativeCommons/30"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-gray-900 dark:text-gray-300 group-hover:text-gray-800 dark:group-hover:text-gray-200">
                        Identity protection applied
                      </span>
                      <p className="text-[11px] text-gray-700 dark:text-gray-600">
                        Face/identifying features obscured for safety
                      </p>
                    </div>
                  </label>
                  {ethics?.identityProtected && (
                    <div className="pl-7">
                      <select
                        aria-label="Identity protection method"
                        value={String(ethics?.identityProtectionDetails || "")}
                        onChange={(e) =>
                          updateEthics(
                            "identityProtectionDetails",
                            e.target.value,
                          )
                        }
                        className="w-full bg-white dark:bg-surface-alt rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-gray-300 border border-border/40 focus:border-accent/50 focus:outline-none cursor-pointer"
                      >
                        <option value="">Select protection method...</option>
                        <option value="black-bar">Black bar over eyes</option>
                        <option value="blur">Blur/pixelation</option>
                        <option value="cropped">Cropped from frame</option>
                        <option value="silhouette">Silhouette/shadow</option>
                        <option value="other">Other method</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {mode === "complete" && (
          <div className="pt-3 border-t border-border/50">
            <p className="text-xs text-gray-700 dark:text-gray-500 mb-2 font-medium">
              Consent Documentation
            </p>
            <p className="text-xs text-gray-700 dark:text-gray-600 mb-2">
              For chain-of-custody and verification · PDF/JPG/PNG up to{" "}
              {formatBytes(MAX_UPLOAD_BYTES.document)}
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              onChange={handleConsentUpload}
              className="hidden"
            />

            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Upload a signed consent form"
                aria-label="Upload a signed consent form"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-gray-500 border border-dashed border-border rounded-lg hover:border-corner-creativeCommons hover:text-corner-creativeCommons transition-colors"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                Attach signed consent form
              </button>
              <button
                onClick={() => setConsentLibraryOpen(true)}
                title="Pick from your library"
                aria-label="Pick from your library"
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm text-gray-500 border border-dashed border-border rounded-lg hover:border-corner-creativeCommons hover:text-corner-creativeCommons transition-colors"
              >
                <Library className="w-4 h-4" aria-hidden="true" />
                Library
              </button>
            </div>

            {consentDocuments.length > 0 && (
              <div className="mt-3 space-y-2">
                {consentDocuments.map((doc, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 rounded-lg bg-surface-alt border border-border/30 group"
                  >
                    <div className="flex-shrink-0">
                      {doc.type === "application/pdf" ? (
                        <svg
                          className="w-5 h-5 text-orange-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5 text-accent"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-300 truncate">
                        {doc.name}
                      </div>
                      <div className="text-xs text-gray-600">
                        {formatFileSize(doc.size)}
                      </div>
                    </div>
                    <button
                      onClick={() => removeConsentDocument(index)}
                      className="flex-shrink-0 p-1 text-gray-600 hover:text-orange-500 transition-colors"
                      title="Remove document"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-700 mt-2">
              Stored locally — never uploaded without your action
            </p>
          </div>
        )}
      </div>

      <AssetLibraryModal
        isOpen={consentLibraryOpen}
        onClose={() => setConsentLibraryOpen(false)}
        onSelect={handleConsentLibraryPick}
        multiSelect
        allowedTypes={["document"]}
        title="Pick a consent document"
      />
    </section>
  );
}
