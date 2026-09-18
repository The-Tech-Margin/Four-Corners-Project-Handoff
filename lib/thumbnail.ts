export async function generateThumbnail(
  file: File,
  maxWidth: number = 200,
  maxHeight: number = 200
): Promise<string> {
  return new Promise((resolve, reject) => {
    // For videos, we'll use a placeholder or extract first frame
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;

      video.onloadedmetadata = () => {
        video.currentTime = 0.5; // Seek to 0.5s
      };

      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(
          maxWidth / video.videoWidth,
          maxHeight / video.videoHeight
        );

        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));

        // Cleanup
        URL.revokeObjectURL(video.src);
      };

      video.onerror = () => {
        reject(new Error("Error loading video"));
      };

      video.src = URL.createObjectURL(file);
    } else {
      // For images
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(
          maxWidth / img.width,
          maxHeight / img.height,
          1 // Don't upscale
        );

        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Use JPEG with 70% quality to keep file size small
        resolve(canvas.toDataURL("image/jpeg", 0.7));

        // Cleanup
        URL.revokeObjectURL(img.src);
      };

      img.onerror = () => {
        reject(new Error("Error loading image"));
      };

      img.src = URL.createObjectURL(file);
    }
  });
}

export function formatFileSize(bytes: number): string {
  if (typeof bytes !== "number" || isNaN(bytes) || bytes <= 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function isFileSizeLarge(bytes: number): boolean {
  const MB_5 = 5 * 1024 * 1024;
  return bytes > MB_5;
}
