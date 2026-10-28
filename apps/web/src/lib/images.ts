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
 * Resizes to fit MAX_IMAGE_DIMENSION (or center-crops to a `square` of that
 * many pixels, for avatars) and re-encodes as WebP, or JPEG where the browser
 * can't encode WebP. Re-encoding also strips EXIF metadata, including GPS
 * location, before anything leaves the device.
 */
export async function prepareImage(file: File, options: { square?: number } = {}): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  // Source rectangle (cropped for squares) and output size.
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  let width: number;
  let height: number;
  if (options.square) {
    const side = Math.min(bitmap.width, bitmap.height);
    sx = (bitmap.width - side) / 2;
    sy = (bitmap.height - side) / 2;
    sw = sh = side;
    width = height = Math.min(options.square, side);
  } else {
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    width = Math.round(bitmap.width * scale);
    height = Math.round(bitmap.height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  bitmap.close();

  const webp = await toBlob(canvas, "image/webp", 0.85);
  if (webp?.type === "image/webp") return { blob: webp, contentType: "image/webp", width, height };

  const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
  if (!jpeg) throw new Error("Couldn't process that image");
  return { blob: jpeg, contentType: "image/jpeg", width, height };
}
