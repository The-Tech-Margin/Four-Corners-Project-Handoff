# Four Corners Data Model Reference

> **Generated from Zod schemas** — do not edit by hand.
> Run `npx tsx scripts/generate-types-doc.ts` to regenerate.
>
> **Runtime source**: `lib/field-registry.ts`
> **DB mapping**: `lib/db/projects-transforms.ts`

---

## Upper-Left Corner: Context (Related Imagery)

Rich media items that provide visual context for the photograph.

**Schema**: `ContextItemSchema[]` (array, required, can be empty)
**DB table**: `context_items`

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `id` | `string` | yes | `id` |  |
| `sourceType` | `"upload"` \| `"url"` | yes | `source_type` |  |
| `blobId` | `number` | no | `—` |  |
| `filename` | `string` | no | `filename` |  |
| `mimeType` | `string` | no | `mime_type` |  |
| `thumbnailDataUrl` | `string` | no | `—` |  |
| `storage_path` | `string` | no | `storage_path` |  |
| `storage_url` | `string` | no | `storage_url` |  |
| `thumbnail_storage_path` | `string` | no | `thumbnail_storage_path` |  |
| `thumbnail_storage_url` | `string` | no | `thumbnail_storage_url` |  |
| `url` | `string` | no | `url` |  |
| `src` | `string` | no | `—` |  |
| `caption` | `string` | no | `caption` |  |
| `type` | `"image"` \| `"video"` | yes | `media_type` |  |
| `description` | `string` | no | `description` |  |
| `credit` | `string` | no | `credit` |  |
| `date` | `string` | no | `date` |  |
| `audioStoragePath` | `string` | no | `audio_storage_path` |  |
| `audioStorageUrl` | `string` | no | `audio_storage_url` |  |
| `audioDataUrl` | `string` | no | `—` |  |
| `audioBlobId` | `number` | no | `audio_blob_id` |  |
| `audioMimeType` | `string` | no | `audio_mime_type` |  |
| `audioDuration` | `number` | no | `audio_duration` |  |
| `linkedProjectId` | `string` | no | `linked_project_id` |  |
| `linkedProjectSlug` | `string` | no | `linked_project_slug` |  |

**Related table**: `context_item_audio` (junction, 1:many audio per context item)

---

## Upper-Right Corner: Links

External resources and references related to the photograph.

**Schema**: `LinkSchema[]` (array, required, can be empty)
**DB table**: `links`

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `title` | `string` | no | `title` | Display title |
| `url` | `string` | no | `url` | URL of resource |
| `source` | `string` | no | `source` | Source/publication name |

---

## Bottom-Left Corner: Backstory

The photographer's narrative and publication context.

**Schema**: `BackStorySchema` (object, required, never null)
**DB table**: `project_backstory` (1:1)

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `text` | `string` | no | `text` | Photographer's narrative about the image |
| `author` | `string` | no | `author` | Photographer name |
| `publication` | `string` | no | `publication` | Organization or publication name |
| `publicationUrl` | `string` | no | `publication_url` | Organization URL |
| `date` | `string` | no | `date` | Date of capture (ISO format) |

---

## Bottom-Right Corner: Creative Commons, Ethics & Photographer

### Creative Commons / Copyright

**Schema**: `CreativeCommonsSchema` (object, required, never null)
**DB table**: `project_creative_commons` (1:1)

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `copyright` | `string` | no | `copyright` | Copyright statement |
| `description` | `string` | no | `description` | Caption/description for publication |

### Code of Ethics

**Schema**: `CodeOfEthicsSchema` (object, optional)
**DB table**: `project_ethics` (1:1)

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `customEthicsText` | `string` | no | `custom_ethics_text` | Custom Ethics Statement |
| `noManipulation` | `boolean` | yes | `no_manipulation` | No Manipulation |
| `manipulationDetails` | `string` | no | `manipulation_details` | Manipulation Details |
| `noStaging` | `boolean` | yes | `no_staging` | No Staging |
| `stagingDetails` | `string` | no | `staging_details` | Staging Details |
| `informedConsent` | `boolean` | yes | `informed_consent` | Informed Consent |
| `consentDetails` | `string` | no | `consent_details` | Consent Details |
| `identityProtected` | `boolean` | yes | `identity_protected` | Identity Protected |
| `identityProtectionDetails` | `string` | no | `identity_protection_details` | Identity Protection Details |
| `consentDocumentUrl` | `string` | no | `consent_document_url` |  |
| `aiAltered` | `boolean` | no | `ai_altered` | AI Altered |
| `aiAlteredDetails` | `string` | no | `ai_altered_details` | AI Alteration Details |

### Photographer Info

**Schema**: `PhotographerInfoSchema` (object, optional)
**DB table**: `project_photographer_info` (1:1)

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `bio` | `string` | no | `bio` | Photographer Bio |
| `contact` | `string` | no | `contact` | Contact |
| `website` | `string` | no | `website` | Website |
| `collaborators` | `string` | no | `collaborators` | Collaborators |

---

## Cross-Cutting: Location

Geographic data for where the photograph was taken.

**Schema**: `LocationDataSchema` (object, optional)
**DB table**: `project_locations` (1:1, PostGIS)

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `latitude` | `unknown` | no | `latitude` | Latitude |
| `longitude` | `unknown` | no | `longitude` | Longitude |
| `city` | `string` \| null | no | `city` |  |
| `state` | `string` \| null | no | `state` |  |
| `country` | `string` \| null | no | `country` |  |
| `formattedLocation` | `string` \| null | no | `formatted_location` | Location |
| `capturedAt` | `string` | no | `captured_at` |  |
| `source` | `"exif"` \| `"device"` \| `"manual"` \| `"voicevault"` | no | `source` |  |
| `address` | `object` | no | `address` |  |

### Nested: Address Detail

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `address.street` | `string` | no | `street` |  |
| `address.street2` | `string` | no | `street2` |  |
| `address.city` | `string` | no | `city` |  |
| `address.district` | `string` | no | `district` |  |
| `address.stateProvince` | `string` | no | `state_province` |  |
| `address.postalCode` | `string` | no | `postal_code` |  |
| `address.country` | `string` | no | `country` |  |

---

## Cross-Cutting: Photo Metadata (EXIF)

Technical metadata extracted from the image file.

**Schema**: `PhotoMetadataSchema` (object, optional)
**DB table**: `photo_metadata` (1:1)

| Field | Type | DB Column | Description |
|-------|------|-----------|-------------|
| `dateTaken` | `string \| null` | `date_taken` | Date/time photo was taken |

### Equipment

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `equipment.cameraMake` | `string` \| null | no | `camera_make` |  |
| `equipment.cameraModel` | `string` \| null | no | `camera_model` |  |
| `equipment.lensModel` | `string` \| null | no | `lens_model` |  |
| `equipment.focalLength` | `string` \| null | no | `focal_length` |  |
| `equipment.iso` | `number` \| `string` \| null | no | `iso` |  |
| `equipment.aperture` | `string` \| null | no | `aperture` |  |
| `equipment.shutterSpeed` | `string` \| null | no | `shutter_speed` |  |

### Image Dimensions

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `image.width` | `number` \| `string` \| null | no | `width` |  |
| `image.height` | `number` \| `string` \| null | no | `height` |  |
| `image.orientation` | `number` \| `string` \| null | no | `orientation` |  |

### Device / Software

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `device.software` | `string` \| null | no | `software` |  |
| `device.hostComputer` | `string` \| null | no | `host_computer` |  |
| `device.artist` | `string` \| null | no | `artist` |  |
| `device.copyright` | `string` \| null | no | `copyright` |  |
| `device.userComment` | `string` \| null | no | `user_comment` |  |
| `device.imageDescription` | `string` \| null | no | `image_description` |  |

### Temporal (EXIF timestamps)

Stored as JSON in DB column `temporal_data`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `temporal.dateTimeOriginal` | `string` \| null | no |  |
| `temporal.dateTime` | `string` \| null | no |  |
| `temporal.dateTimeDigitized` | `string` \| null | no |  |
| `temporal.dateModified` | `string` \| null | no |  |
| `temporal.offsetTimeOriginal` | `string` \| null | no |  |
| `temporal.offsetTime` | `string` \| null | no |  |
| `temporal.offsetTimeDigitized` | `string` \| null | no |  |
| `temporal.subSecTimeOriginal` | `string` \| null | no |  |
| `temporal.subSecTime` | `string` \| null | no |  |
| `temporal.subSecTimeDigitized` | `string` \| null | no |  |
| `temporal.gpsDateStamp` | `string` \| null | no |  |
| `temporal.gpsTimeStamp` | `string` \| null | no |  |

### GPS Extended

Stored as JSON in DB column `gps_extended`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gps.altitude` | `unknown` | no |  |
| `gps.altitudeRef` | `unknown` | no |  |
| `gps.speed` | `unknown` | no |  |
| `gps.speedRef` | `unknown` | no |  |
| `gps.imgDirection` | `unknown` | no |  |
| `gps.imgDirectionRef` | `unknown` | no |  |
| `gps.destBearing` | `unknown` | no |  |
| `gps.destBearingRef` | `unknown` | no |  |

---

## Cross-Cutting: Voice Transcriptions

Audio recordings with transcriptions, attachable to any field via `fieldId`.

**Schema**: `VoiceTranscriptionSchema[]` (array, optional)
**DB table**: `voice_transcriptions`

| Field | Type | Required | DB Column | Description |
|-------|------|----------|-----------|-------------|
| `id` | `string` | yes | `id` |  |
| `recordingId` | `string` | yes | `recording_id` |  |
| `text` | `string` | yes | `text` |  |
| `transcribedAt` | `string` | yes | `transcribed_at` |  |
| `fieldId` | `string` | no | `field_id` |  |
| `audioDataUrl` | `string` | no | `—` |  |
| `audioStoragePath` | `string` | no | `audio_storage_path` |  |
| `audioStorageUrl` | `string` | no | `audio_storage_url` |  |
| `audioBlobId` | `number` | no | `audio_blob_id` |  |
| `mimeType` | `string` | no | `mime_type` |  |
| `duration` | `number` | no | `duration` |  |

---

## System: Meta

**Schema**: `MetaSchema` (object, optional)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `createdAt` | `string` | yes |  |
| `updatedAt` | `string` | yes |  |
| `editorVersion` | `string` | yes |  |
| `mode` | `"minimal"` \| `"standard"` \| `"complete"` | yes |  |

---

## Top-Level Schema Shape

```typescript
interface FourCornersMetadataExtended {
  backStory: BackStory;                       // required, never null
  context: ContextItem[];                     // required, can be empty
  links: Link[];                              // required, can be empty
  creativeCommons: CreativeCommons;           // required, never null
  ethics?: CodeOfEthics;                      // optional
  photographerInfo?: PhotographerInfo;        // optional
  location?: LocationData;                    // optional
  photoMetadata?: PhotoMetadata;              // optional
  voiceTranscriptions?: VoiceTranscription[]; // optional
  meta?: Meta;                                // optional
}
```

---

## Field Registry Summary

The `FIELD_REGISTRY` in `lib/field-registry.ts` maps 32 fields with indexed lookups by:
- **Path**: `FIELD_INDEX.getByPath("backStory.text")`
- **UI section**: `FIELD_INDEX.getBySection("backstory")`
- **Canvas corner**: `FIELD_INDEX.getByCanvasCorner("cc")`
- **IIIF section**: `FIELD_INDEX.getByIIIFSection("metadata")`

## DB Architecture

- **1:1 tables**: `project_backstory`, `project_creative_commons`, `project_photographer_info`, `project_ethics`, `project_locations` (PostGIS), `photo_metadata`
- **1:many tables**: `context_items`, `links`, `voice_transcriptions`
- **Junction**: `context_item_audio` (1:many audio per context item)
- **All tables**: RLS enabled, ON DELETE CASCADE from `projects`
- **Read path**: `buildMetadataFromNormalized()` in `lib/db/projects-transforms.ts`
- **Write path**: `syncNormalizedTables()` in `hooks/useProjectSave.ts`
