import type { UploadPurpose } from "@cs/core";

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

const FOLDERS: Record<UploadPurpose, string> = { post: "posts", banner: "banners", avatar: "avatars" };

/** Keys are "<folder>/<uploaderId>/<uuid>.<ext>", so ownership can be read straight off the key. */
export function userUploadPrefix(userId: string, purpose: UploadPurpose): string {
  return `${FOLDERS[purpose]}/${userId}/`;
}

export const UPLOAD_KEY_PATTERN = /^(posts|banners|avatars)\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.(webp|jpg|png)$/;

/** The uploader's user id, or null if the key isn't one of ours. */
export function uploadOwner(key: string): string | null {
  return UPLOAD_KEY_PATTERN.test(key) ? key.split("/")[1]! : null;
}
