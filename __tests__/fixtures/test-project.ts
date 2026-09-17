/**
 * A synthetic project fixture, shaped like one a person would build: a
 * backstory with a date, a credit and caption, three context images and one
 * voice note. The counts below are what the canvas tests assert against.
 */

export const TEST_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
export const TEST_PROJECT_SLUG = "harbour-morning";

const OWNER_ID = "00000000-0000-4000-8000-0000000000aa";
const mediaUrl = (name: string) =>
  `/api/blobs/context-media/${OWNER_ID}/context-images/${TEST_PROJECT_ID}/${name}`;
const thumbUrl = (name: string) =>
  `/api/blobs/context-media/${OWNER_ID}/context-images/${TEST_PROJECT_ID}/thumbs/${name}`;

function contextImage(id: string, name: string) {
  return {
    id,
    caption: "",
    filename: name,
    type: "image" as const,
    sourceType: "upload" as const,
    storage_url: mediaUrl(name),
    thumbnail_storage_url: thumbUrl(name),
  };
}

/** Store-shaped metadata — what the Zustand store holds */
export const TEST_STORE_STATE = {
  backStory: {
    text: "Shot from the breakwater an hour before sunrise, waiting for the fishing fleet to leave. The light was flat and the wind was cold enough that the crew worked in silence, which is why the frame is so still.",
    author: "",
    date: "2026-01-27",
    publication: "",
    publicationUrl: "",
  },
  context: [
    contextImage("00000000-0000-4000-8000-000000000101", "harbour-1.jpg"),
    contextImage("00000000-0000-4000-8000-000000000102", "harbour-2.jpg"),
    contextImage("00000000-0000-4000-8000-000000000103", "harbour-3.jpg"),
  ],
  links: [] as { title: string; url: string; source: string }[],
  creativeCommons: {
    copyright: "Test Photographer",
    description: "Fishing boats leaving the harbour before sunrise, in flat winter light.",
  },
  ethics: {
    customEthicsText: "",
    noManipulation: false,
    manipulationDetails: "",
    noStaging: false,
    stagingDetails: "",
    informedConsent: false,
    consentDetails: "",
    identityProtected: false,
    identityProtectionDetails: "",
    aiAltered: false,
    aiAlteredDetails: "",
  },
  photographerInfo: {
    bio: "",
    website: "",
    contact: "",
    collaborators: "",
  },
  photoMetadata: {
    equipment: {
      cameraMake: "",
      cameraModel: "",
    },
  },
  voiceTranscriptions: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      text: "Wind noise, then an engine starting.",
      fieldId: "caption-description",
      duration: 12500,
      transcribedAt: "2026-01-27T06:14:00.000Z",
    },
  ],
  location: undefined,
  imageSrc: null as string | null,
};

/** Fields that should be populated (non-empty) for this test project */
export const POPULATED_FIELDS = {
  "backStory.text": true,
  "backStory.date": true,
  "creativeCommons.copyright": true,
  "creativeCommons.description": true,
} as const;

/** Expected shape counts when rendering canvas with this data */
export const EXPECTED_CANVAS_SHAPES = {
  zones: 4,               // always 4 corner zones
  photoCard: 0,           // no imageSrc
  contextItems: 3,        // 3 context images
  textBlocks: 2,          // backStory.text + backStory.date (populated)
  ccTextBlocks: 2,        // creativeCommons.copyright + description (populated)
  linkCards: 0,           // no links
  voiceNotes: 1,          // 1 transcription
};
