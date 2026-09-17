/**
 * @module media/VideoEngine
 * Video element utilities for syncing video playback with the Konva canvas.
 */

import Konva from "konva";

/**
 * Static utility class for creating and syncing video elements
 * with Konva canvas shapes.
 */
export class VideoEngine {
  /**
   * Create a video element configured for canvas use.
   * @param src - Video source URL.
   * @returns A configured HTMLVideoElement.
   */
  static createVideoElement(src: string): HTMLVideoElement {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.playsInline = true;
    video.src = src;
    return video;
  }

  /**
   * Capture the first frame of a video as a poster image.
   * Seeks to time 0, draws the frame to an offscreen canvas, and returns it.
   * @param video - The video element to capture from.
   * @returns A canvas element with the poster frame drawn.
   */
  static async getPosterFrame(
    video: HTMLVideoElement,
  ): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");

      const onSeeked = () => {
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        video.removeEventListener("seeked", onSeeked);
        resolve(canvas);
      };

      const onError = () => {
        video.removeEventListener("error", onError);
        reject(new Error("Failed to get poster frame from video."));
      };

      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);

      if (video.readyState >= 1) {
        video.currentTime = 0;
      } else {
        video.addEventListener(
          "loadedmetadata",
          () => {
            video.currentTime = 0;
          },
          { once: true },
        );
        video.load();
      }
    });
  }

  /**
   * Start a Konva.Animation that redraws a Konva.Image from a playing video
   * element each frame. Stops automatically when the video pauses or ends.
   * @param video - The source video element.
   * @param konvaImage - The Konva.Image node to update.
   * @param layer - The Konva.Layer to animate on.
   * @returns The Konva.Animation instance (call .stop() to halt manually).
   */
  static syncToCanvas(
    video: HTMLVideoElement,
    _konvaImage: Konva.Image,
    layer: Konva.Layer,
  ): Konva.Animation {
    const anim = new Konva.Animation(() => {
      // Konva.Image re-renders automatically when the layer draws,
      // as long as the image source (the video element) is updating.
    }, layer);

    const startSync = () => anim.start();
    const stopSync = () => anim.stop();

    video.addEventListener("play", startSync);
    video.addEventListener("pause", stopSync);
    video.addEventListener("ended", stopSync);

    // If the video is already playing, start immediately.
    if (!video.paused) {
      anim.start();
    }

    return anim;
  }
}
