/**
 * Test fixture: Komodos writing session project (9c98c2fc)
 * Maps to real DB data for integration testing.
 * Store shape matches FourCornersState; DB shape matches normalized tables.
 */

export const TEST_PROJECT_ID = "9c98c2fc-330e-483f-be60-854676f632db";
export const TEST_PROJECT_SLUG = "ben-baumann-and-taran-dugal";

/** Store-shaped metadata — what the Zustand store holds */
export const TEST_STORE_STATE = {
  backStory: {
    text: "Taken January 3rd, 2026 at a cabin north of Owego, NY as part of a writing retreat for the Brooklyn rock band Komodos. Because it was so cold outside in early January, all we could do was sit inside the small cabin we'd rented out on Airbnb and write music. We'd brought our whole studio setup, microphones included and laid it all out in the wood-paneled living room. Ben (bassist) and Taran (vocals, guitar) began working on a new song with Hunter (guitar) and I (drums), which is when I took this image, as part of an effort to document the experience.",
    author: "",
    date: "2026-01-27",
    publication: "",
    publicationUrl: "",
  },
  context: [
    { id: "e52eb7a5-2909-4fdd-8d9a-097efc084f02", caption: "", filename: "kabir_music-1.jpg", type: "image" as const, sourceType: "upload" as const, storage_url: "https://bqavhyldbazlqpeglzzv.supabase.co/storage/v1/object/public/context-media/ab2bade3-bc00-4649-ab78-283effa2c9fc/context-images/9c98c2fc-330e-483f-be60-854676f632db/kabir_music-1.jpg", thumbnail_storage_url: "https://bqavhyldbazlqpeglzzv.supabase.co/storage/v1/object/public/context-media/ab2bade3-bc00-4649-ab78-283effa2c9fc/context-images/9c98c2fc-330e-483f-be60-854676f632db/thumbs/kabir_music-1.jpg" },
    { id: "48c601bb-1031-4316-b58b-52a35b47e798", caption: "", filename: "kabir_music-2.jpg", type: "image" as const, sourceType: "upload" as const, storage_url: "https://bqavhyldbazlqpeglzzv.supabase.co/storage/v1/object/public/context-media/ab2bade3-bc00-4649-ab78-283effa2c9fc/context-images/9c98c2fc-330e-483f-be60-854676f632db/kabir_music-2.jpg", thumbnail_storage_url: "https://bqavhyldbazlqpeglzzv.supabase.co/storage/v1/object/public/context-media/ab2bade3-bc00-4649-ab78-283effa2c9fc/context-images/9c98c2fc-330e-483f-be60-854676f632db/thumbs/kabir_music-2.jpg" },
    { id: "50f6eec8-56dd-43f3-8a39-4c802ba22d52", caption: "", filename: "kabir_music-3.jpg", type: "image" as const, sourceType: "upload" as const, storage_url: "https://bqavhyldbazlqpeglzzv.supabase.co/storage/v1/object/public/context-media/ab2bade3-bc00-4649-ab78-283effa2c9fc/context-images/9c98c2fc-330e-483f-be60-854676f632db/kabir_music-3.jpg", thumbnail_storage_url: "https://bqavhyldbazlqpeglzzv.supabase.co/storage/v1/object/public/context-media/ab2bade3-bc00-4649-ab78-283effa2c9fc/context-images/9c98c2fc-330e-483f-be60-854676f632db/thumbs/kabir_music-3.jpg" },
  ],
  links: [] as { title: string; url: string; source: string }[],
  creativeCommons: {
    copyright: "Kabir Dugal",
    description: "Ben Baumann and Taran Dugal, members of rock band Komodos, playing acoustic guitars in upstate New York during a songwriting session, January 2026.  ",
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
      id: "36178ee0-92e8-418d-ad23-dad3b5eb3f11",
      text: "♪♪ ♪♪ ♪♪",
      fieldId: "caption-description",
      duration: 224052.25,
      transcribedAt: "2026-03-24T13:58:13.570Z",
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
  contextItems: 3,        // 3 context images (fixture trimmed to 3)
  textBlocks: 2,          // backStory.text + backStory.date (populated)
  ccTextBlocks: 2,        // creativeCommons.copyright + description (populated)
  linkCards: 0,            // no links
  voiceNotes: 1,          // 1 transcription
};

/** DB-shaped data — matches normalized table columns */
export const TEST_DB_ROW = {
  project_backstory: {
    text: TEST_STORE_STATE.backStory.text,
    author: "",
    date: "2026-01-27",
  },
  project_creative_commons: {
    copyright: "Kabir Dugal",
    description: TEST_STORE_STATE.creativeCommons.description,
  },
  project_ethics: {
    custom_ethics_text: null,
    no_manipulation: false,
    manipulation_details: null,
    no_staging: false,
    staging_details: null,
    informed_consent: false,
    consent_details: null,
    identity_protected: false,
    identity_protection_details: null,
    ai_altered: false,
    ai_altered_details: null,
  },
  photo_metadata: {
    camera_make: null,
    camera_model: null,
    iso: "125",
    software: "Adobe Lightroom 9.1 (Macintosh)",
  },
  context_items: TEST_STORE_STATE.context.map((c, i) => ({
    id: c.id,
    caption: c.caption,
    filename: c.filename,
    media_type: c.type,
    source_type: c.sourceType,
    storage_url: c.storage_url,
    thumbnail_storage_url: c.thumbnail_storage_url,
    position: i,
  })),
  links: [],
  voice_transcriptions: [
    {
      id: "36178ee0-92e8-418d-ad23-dad3b5eb3f11",
      text: "♪♪ ♪♪ ♪♪",
      field_id: "caption-description",
      duration: 224052.25,
    },
  ],
};
