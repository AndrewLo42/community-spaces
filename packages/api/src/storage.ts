/**
 * Where uploaded images live. The host app provides the implementation:
 * local disk in dev, Cloudflare R2 in production. Clients upload directly to
 * `url` so file bytes never pass through the API.
 */
export interface Storage {
  createUpload(input: { key: string; contentType: string; size: number }): Promise<{
    url: string;
    headers: Record<string, string>;
  }>;
  publicUrl(key: string): string;
  /** Best effort: missing keys are ignored. */
  deleteObjects(keys: string[]): Promise<void>;
}

/** Keys are namespaced by uploader so a post can only attach its author's images. */
export function userUploadPrefix(userId: string): string {
  return `posts/${userId}/`;
}

export const UPLOAD_KEY_PATTERN = /^posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.(webp|jpg|png)$/;
