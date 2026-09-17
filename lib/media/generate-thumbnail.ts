/**
 * Browser-side thumbnail generation. Images and videos both come back as
 * JPEG blobs, scaled to fit while preserving aspect ratio.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

"use client";

export async function generateThumbnailBlob(
  originalBlob: Blob,
  maxWidth: number = 400,
  maxHeight: number = 400
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (originalBlob.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;

      video.onloadedmetadata = () => {
        video.currentTime = 0.5;
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
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create thumbnail blob"));
            }
            URL.revokeObjectURL(video.src);
          },
          "image/jpeg",
          0.8
        );
      };

      video.onerror = () => {
        reject(new Error("Error loading video"));
      };

      video.src = URL.createObjectURL(originalBlob);
    } else {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);

        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create thumbnail blob"));
            }
            URL.revokeObjectURL(img.src);
          },
          "image/jpeg",
          0.8
        );
      };

      img.onerror = () => {
        reject(new Error("Error loading image"));
      };

      img.src = URL.createObjectURL(originalBlob);
    }
  });
}
