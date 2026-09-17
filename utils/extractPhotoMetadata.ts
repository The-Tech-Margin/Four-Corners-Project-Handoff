import * as exifr from "exifr";

export interface ExtractedMetadata {
  // Temporal - Primary
  dateTaken: string | null;

  // Temporal - Extended (for NGO workflows)
  dateTimeOriginal?: string | null;
  dateTime?: string | null;
  dateTimeDigitized?: string | null;
  dateModified?: string | null;

  // Timezone offsets
  offsetTimeOriginal?: string | null;
  offsetTime?: string | null;
  offsetTimeDigitized?: string | null;

  // Subsecond precision
  subSecTimeOriginal?: string | null;
  subSecTime?: string | null;
  subSecTimeDigitized?: string | null;

  // GPS timestamp
  gpsDateStamp?: string | null;
  gpsTimeStamp?: string | null;

  // Location
  latitude: number | null;
  longitude: number | null;

  // GPS Extended (device motion/direction)
  // Ref fields widened to number | string because exifr can return either
  // the raw byte (number) or a translated label (string) depending on version;
  // matches the Zod union in field-registry.ts (LocationDataSchema gps.*).
  gpsAltitude?: number | null;
  gpsAltitudeRef?: number | string | null;
  gpsSpeed?: number | null;
  gpsSpeedRef?: number | string | null;
  gpsImgDirection?: number | null;
  gpsImgDirectionRef?: number | string | null;
  gpsDestBearing?: number | null;
  gpsDestBearingRef?: number | string | null;

  // Equipment
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  focalLength: string | null;
  iso: number | null;
  aperture: string | null;
  shutterSpeed: string | null;

  // Device/Software metadata
  software?: string | null;
  hostComputer?: string | null;
  artist?: string | null;
  copyright?: string | null;
  userComment?: string | null;
  imageDescription?: string | null;

  // Image properties
  width: number | null;
  height: number | null;
  orientation: number | null;
}

const createEmptyMetadata = (): ExtractedMetadata => ({
  dateTaken: null,
  latitude: null,
  longitude: null,
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  focalLength: null,
  iso: null,
  aperture: null,
  shutterSpeed: null,
  width: null,
  height: null,
  orientation: null,
});

/** Video files don't carry EXIF in any format exifr can read. Calling
 *  `exifr.parse()` on a video throws "Unknown file format" — eight times,
 *  because exifr fans out across its parser strategies before giving up — and
 *  spams the console without actually telling the caller anything useful.
 *  Short-circuit videos to empty metadata so the rest of the upload flow
 *  (data-URL preview, save, etc.) runs clean. */
function isVideoFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith("video/")) return true;
  return /\.(mp4|webm|mov|m4v|avi|mkv|3gp|3g2|mpeg|mpg|ogv|wmv|flv|hevc|m2ts|ts)$/i.test(file.name);
}

/** HEIC/HEIF files aren't reliably parsed by exifr (internal buffer errors on
 *  some iPhone variants). We skip parsing for those and return empty metadata;
 *  callers should extract EXIF from the post-conversion JPEG if they need it. */
function isHeicOrHeif(file: File): boolean {
  const mime = file.type.toLowerCase();
  if (
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence"
  ) {
    return true;
  }
  return /\.(heic|heif)$/i.test(file.name);
}

/** Normalise exifr reference-byte values (GPSAltitudeRef etc.) to number|string|null.
 *  exifr can return these as raw Buffer/Uint8Array which fails Zod validation. */
function normaliseRef(value: unknown): number | string | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  // Buffer / Uint8Array — take the first byte
  if (typeof value === "object" && value !== null) {
    const v = value as { [k: number]: unknown; length?: number };
    if (typeof v.length === "number" && v.length > 0 && typeof v[0] === "number") {
      return v[0] as number;
    }
  }
  return null;
}

export async function extractPhotoMetadata(
  file: File
): Promise<ExtractedMetadata> {
  // Short-circuit for video — exifr throws on any video container and we
  // don't want the parser noise leaking into the console for what is a
  // perfectly valid upload.
  if (isVideoFile(file)) {
    return createEmptyMetadata();
  }

  // Short-circuit for HEIC — exifr's HEIC path throws on some iPhone files.
  // The caller (image-drop-zone) converts HEIC→JPEG and can re-extract from
  // the resulting JPEG if it carries retained EXIF.
  if (isHeicOrHeif(file)) {
    return createEmptyMetadata();
  }

  try {
    const exifData = await exifr.parse(file, {
      pick: [
        // Temporal fields
        "DateTimeOriginal",
        "DateTime",
        "DateTimeDigitized",
        "CreateDate",
        "ModifyDate",
        // Timezone offsets
        "OffsetTimeOriginal",
        "OffsetTime",
        "OffsetTimeDigitized",
        // Subsecond precision
        "SubSecTimeOriginal",
        "SubSecTime",
        "SubSecTimeDigitized",
        // GPS timestamp
        "GPSDateStamp",
        "GPSTimeStamp",
        // Location
        "GPSLatitude",
        "GPSLongitude",
        // GPS Extended
        "GPSAltitude",
        "GPSAltitudeRef",
        "GPSSpeed",
        "GPSSpeedRef",
        "GPSImgDirection",
        "GPSImgDirectionRef",
        "GPSDestBearing",
        "GPSDestBearingRef",
        // Equipment
        "Make",
        "Model",
        "LensModel",
        "FocalLength",
        "ISO",
        "FNumber",
        "ExposureTime",
        // Device/Software
        "Software",
        "HostComputer",
        "Artist",
        "Copyright",
        "UserComment",
        "ImageDescription",
        // Image properties
        "ImageWidth",
        "ImageHeight",
        "ExifImageWidth",
        "ExifImageHeight",
        "Orientation",
      ],
    });

    if (!exifData) {
      console.log("No EXIF data found in image");
      return createEmptyMetadata();
    }

    // Log raw EXIF data for debugging
    if (process.env.NODE_ENV === "development") {
      console.log("Extracted EXIF data:", exifData);
    }

    // Format date - prefer DateTimeOriginal over DateTime
    let dateTaken: string | null = null;
    const dateSource = exifData.DateTimeOriginal || exifData.DateTime;
    if (dateSource) {
      try {
        dateTaken = new Date(dateSource).toISOString();
      } catch {
        console.warn("Could not parse date:", dateSource);
      }
    }

    // Format aperture
    let aperture: string | null = null;
    if (exifData.FNumber) {
      aperture =
        typeof exifData.FNumber === "number"
          ? `f/${exifData.FNumber.toFixed(1)}`
          : `f/${exifData.FNumber}`;
    }

    // Format shutter speed
    let shutterSpeed: string | null = null;
    if (exifData.ExposureTime) {
      if (exifData.ExposureTime >= 1) {
        shutterSpeed = `${exifData.ExposureTime}s`;
      } else {
        const fraction = Math.round(1 / exifData.ExposureTime);
        shutterSpeed = `1/${fraction}`;
      }
    }

    // Format focal length
    let focalLength: string | null = null;
    if (exifData.FocalLength) {
      focalLength = `${Math.round(exifData.FocalLength)}mm`;
    }

    // Helper to format dates to ISO string. exifr returns Date | string | number
    // depending on the field, so accept unknown and let `new Date()` coerce.
    const formatDate = (dateValue: unknown): string | null => {
      if (!dateValue) return null;
      try {
        return new Date(dateValue as string | number | Date).toISOString();
      } catch {
        console.warn("Could not parse date:", dateValue);
        return null;
      }
    };

    // Use exifr.gps() for reliable DECIMAL lat/lon. exifr.parse returns raw
    // DMS arrays ([deg, min, sec]) when GPSLatitudeRef/GPSLongitudeRef aren't
    // picked, which fails Zod's z.number() validation downstream.
    let gpsLat: number | null = null;
    let gpsLon: number | null = null;
    try {
      const gpsResult = await exifr.gps(file);
      if (gpsResult && typeof gpsResult.latitude === "number" && typeof gpsResult.longitude === "number") {
        gpsLat = gpsResult.latitude;
        gpsLon = gpsResult.longitude;
      }
    } catch {
      // No GPS data, or unreadable — leave as null
    }

    return {
      // Primary date field (backwards compatible)
      dateTaken,

      // Extended temporal data for NGO workflows
      dateTimeOriginal: formatDate(exifData.DateTimeOriginal),
      dateTime: formatDate(exifData.DateTime),
      dateTimeDigitized: formatDate(
        exifData.DateTimeDigitized || exifData.CreateDate
      ),
      dateModified: formatDate(exifData.ModifyDate),

      // Timezone offsets
      offsetTimeOriginal: exifData.OffsetTimeOriginal ?? null,
      offsetTime: exifData.OffsetTime ?? null,
      offsetTimeDigitized: exifData.OffsetTimeDigitized ?? null,

      // Subsecond precision
      subSecTimeOriginal: exifData.SubSecTimeOriginal ?? null,
      subSecTime: exifData.SubSecTime ?? null,
      subSecTimeDigitized: exifData.SubSecTimeDigitized ?? null,

      // GPS timestamp
      gpsDateStamp: exifData.GPSDateStamp ?? null,
      gpsTimeStamp: exifData.GPSTimeStamp
        ? Array.isArray(exifData.GPSTimeStamp)
          ? exifData.GPSTimeStamp.join(":")
          : String(exifData.GPSTimeStamp)
        : null,

      // Location (decimal degrees from exifr.gps())
      latitude: gpsLat,
      longitude: gpsLon,

      // GPS Extended (device motion/direction)
      // exifr can return ref fields as raw Buffer/Uint8Array depending on
      // version + pick options; normaliseRef coerces to number|string|null.
      gpsAltitude: typeof exifData.GPSAltitude === "number" ? exifData.GPSAltitude : null,
      gpsAltitudeRef: normaliseRef(exifData.GPSAltitudeRef),
      gpsSpeed: typeof exifData.GPSSpeed === "number" ? exifData.GPSSpeed : null,
      gpsSpeedRef: normaliseRef(exifData.GPSSpeedRef),
      gpsImgDirection: typeof exifData.GPSImgDirection === "number" ? exifData.GPSImgDirection : null,
      gpsImgDirectionRef: normaliseRef(exifData.GPSImgDirectionRef),
      gpsDestBearing: typeof exifData.GPSDestBearing === "number" ? exifData.GPSDestBearing : null,
      gpsDestBearingRef: normaliseRef(exifData.GPSDestBearingRef),

      // Equipment
      cameraMake: exifData.Make ?? null,
      cameraModel: exifData.Model ?? null,
      lensModel: exifData.LensModel ?? null,
      focalLength,
      iso: exifData.ISO ?? null,
      aperture,
      shutterSpeed,

      // Device/Software metadata
      software: exifData.Software ?? null,
      hostComputer: exifData.HostComputer ?? null,
      artist: exifData.Artist ?? null,
      copyright: exifData.Copyright ?? null,
      userComment: exifData.UserComment ?? null,
      imageDescription: exifData.ImageDescription ?? null,

      // Image properties
      width: exifData.ExifImageWidth || exifData.ImageWidth || null,
      height: exifData.ExifImageHeight || exifData.ImageHeight || null,
      orientation: exifData.Orientation ?? null,
    };
  } catch (error) {
    console.error("Error extracting EXIF metadata:", error);
    return createEmptyMetadata();
  }
}
