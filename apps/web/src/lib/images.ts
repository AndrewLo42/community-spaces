import { MAX_IMAGE_DIMENSION, type ImageContentType } from "@cs/core";

export interface PreparedImage {
  blob: Blob;
  contentType: ImageContentType;
  width: number;
  height: number;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Resizes to fit MAX_IMAGE_DIMENSION and re-encodes as WebP (JPEG where the
 * browser can't encode WebP). Re-encoding also strips EXIF metadata,
 * including GPS location, before anything leaves the device.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webp = await toBlob(canvas, "image/webp", 0.85);
  if (webp?.type === "image/webp") return { blob: webp, contentType: "image/webp", width, height };

  const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
  if (!jpeg) throw new Error("Couldn't process that image");
  return { blob: jpeg, contentType: "image/jpeg", width, height };
}
