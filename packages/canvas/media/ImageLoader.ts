/**
 * @module media/ImageLoader
 * Progressive image loading pipeline.
 * Uses native Image() constructor and Canvas 2D API — no external dependencies.
 */

/**
 * Static utility class for loading images with progressive enhancement.
 */
export class ImageLoader {
  /**
   * Load an image from a URL.
   * @param src - Image URL or data URI.
   * @returns A promise that resolves with the loaded HTMLImageElement.
   */
  static async loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (_e) => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  /**
   * Load a thumbnail first, then the full-resolution image.
   * Calls onThumbnail as soon as the thumbnail loads, then onFull when
   * the high-res version is ready.
   * @param thumbnailSrc - Low-resolution thumbnail URL.
   * @param fullSrc - Full-resolution image URL.
   * @param onThumbnail - Callback with the loaded thumbnail image.
   * @param onFull - Callback with the loaded full image.
   */
  static async loadProgressive(
    thumbnailSrc: string,
    fullSrc: string,
    onThumbnail: (img: HTMLImageElement) => void,
    onFull: (img: HTMLImageElement) => void
  ): Promise<void> {
    const thumb = await ImageLoader.loadImage(thumbnailSrc);
    onThumbnail(thumb);

    const full = await ImageLoader.loadImage(fullSrc);
    onFull(full);
  }

  /**
   * Create a colored placeholder canvas with a simple loading indicator.
   * @param width - Placeholder width in pixels.
   * @param height - Placeholder height in pixels.
   * @param color - Fill color (defaults to light gray).
   * @returns An HTMLCanvasElement with the placeholder drawn.
   */
  static createPlaceholder(
    width: number,
    height: number,
    color = '#e2e8f0'
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Background fill
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    // Simple spinner: arc in center
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.1;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 1.5);
    ctx.stroke();

    // Arrow tip on the arc
    const tipAngle = Math.PI * 1.5;
    const tipX = cx + Math.cos(tipAngle) * radius;
    const tipY = cy + Math.sin(tipAngle) * radius;
    ctx.beginPath();
    ctx.moveTo(tipX - 4, tipY - 4);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX + 4, tipY - 4);
    ctx.stroke();

    return canvas;
  }

  /**
   * Determine whether the full-resolution image should be loaded
   * based on the current zoom level.
   * @param zoom - Current camera zoom.
   * @param threshold - Minimum zoom to trigger full load (default 0.5).
   * @returns True if zoom exceeds the threshold.
   */
  static shouldLoadFull(zoom: number, threshold = 0.5): boolean {
    return zoom > threshold;
  }
}
