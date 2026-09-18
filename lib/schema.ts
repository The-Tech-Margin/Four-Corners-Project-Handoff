/**
 * SCHEMA V2 - Registry-Based
 *
 * Exports types from field-registry and provides backward compatibility
 * with existing schema.ts interface.
 */

import type {
  FourCornersMetadataExtended,
  BackStory,
  ContextItem,
  Link,
  CreativeCommons,
  CodeOfEthics,
  PhotographerInfo,
  LocationData,
  PhotoMetadata,
  VoiceTranscription,
  Meta,
} from "./field-registry";
import {
  CURRENT_EXPORT_VERSION,
  EXPORT_STRIPPED_CONTEXT_FIELDS,
  EXPORT_STRIPPED_VOICE_FIELDS,
  omitEphemeral,
} from "./export-contract";

/**
 * Four Corners Schema & Type Definitions
 * Registry-based schema with backward compatibility
 *
 * @author TheTechMargin
 */

// Re-export types from field-registry
export type {
  FourCornersMetadataExtended,
  BackStory as FourCornersBackStory,
  ContextItem as FourCornersContextItem,
  Link as FourCornersLink,
  CreativeCommons as FourCornersCreativeCommons,
  CodeOfEthics,
  PhotographerInfo,
  LocationData,
  PhotoMetadata,
  VoiceTranscription,
  Meta,
};

// Standard Four Corners format (for fourcorners.js compatibility)
export interface FourCornersMetadata {
  backStory: BackStory;
  context: ContextItem[];
  links: Link[];
  creativeCommons: CreativeCommons;
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createEmptyMetadata(): FourCornersMetadataExtended {
  return {
    backStory: {
      text: "",
      author: "",
      publication: "",
      publicationUrl: "",
      date: new Date().toISOString().split("T")[0],
    },
    context: [],
    links: [],
    creativeCommons: {
      copyright: "",
      description: "",
    },
    ethics: {
      noManipulation: false,
      noStaging: false,
      informedConsent: false,
      identityProtected: false,
    },
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editorVersion: CURRENT_EXPORT_VERSION,
      mode: "complete",
    },
  };
}

// ============================================================================
// Export Helpers
// ============================================================================

/**
 * Export full metadata for fourcorners.js library
 * Core fields at root level, extended NGO data nested under _ext
 *
 * @param excludeLocation - When true, location data is omitted from export
 */
export function toFourCornersSchema(
  data: FourCornersMetadataExtended,
  mainImage?: string,
  excludeLocation?: boolean
): Record<string, unknown> {
  // Clean context items for export — strip ephemeral client state and
  // internal storage paths per the shared export contract.
  const cleanedContext = (data.context || []).map((item) =>
    omitEphemeral(item, EXPORT_STRIPPED_CONTEXT_FIELDS),
  );

  return {
    // Standard fourcorners.js fields (root level)
    backStory: data.backStory,
    context: cleanedContext,
    links: data.links,
    creativeCommons: data.creativeCommons,

    // Extended fields (ignored by fourcorners.js, preserved for our use)
    _ext: {
      ethics: data.ethics,
      photographerInfo: data.photographerInfo,
      location: excludeLocation ? undefined : data.location,
      photoMetadata: data.photoMetadata,
      voiceTranscriptions: data.voiceTranscriptions?.map((vt) =>
        omitEphemeral(vt, EXPORT_STRIPPED_VOICE_FIELDS),
      ),
      meta: data.meta,
      mainImage: mainImage,
    },
  };
}

/**
 * Export full metadata including all fields (for JSON download)
 */
export function toFullSchema(
  data: FourCornersMetadataExtended
): FourCornersMetadataExtended {
  return {
    backStory: data.backStory,
    context: data.context,
    links: data.links,
    creativeCommons: data.creativeCommons,
    ethics: data.ethics,
    photographerInfo: data.photographerInfo,
    location: data.location,
    photoMetadata: data.photoMetadata,
    voiceTranscriptions: data.voiceTranscriptions,
    meta: data.meta,
  };
}

/**
 * Generate HTML embed snippet
 */
export function toEmbedSnippet(
  data: FourCornersMetadata,
  filename: string
): string {
  const json = JSON.stringify(data, null, 2);
  return `<script data-4c-meta="${filename}" type="text/json">
${json}
</script>`;
}

