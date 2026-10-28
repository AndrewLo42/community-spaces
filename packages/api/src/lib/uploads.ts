import { randomUUID } from "node:crypto";
import { UNUSED_UPLOAD_TTL_MS, type ImageContentType, type UploadPurpose } from "@cs/core";
import { and, eq, inArray, isNull, lt, uploads, type Db } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { userUploadPrefix, type Storage } from "../storage";

const extensions: Record<ImageContentType, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Issues an upload URL and records the key, so unused files can be found and deleted later. */
export async function createUpload(
  db: Db,
  storage: Storage,
  input: { userId: string; purpose: UploadPurpose; contentType: ImageContentType; size: number },
) {
  const key = `${userUploadPrefix(input.userId, input.purpose)}${randomUUID()}.${extensions[input.contentType]}`;
  await db.insert(uploads).values({ key, userId: input.userId, purpose: input.purpose, size: input.size });
  const target = await storage.createUpload({ key, contentType: input.contentType, size: input.size });
  return { key, ...target };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Marks uploads as in use. Every key must be one this user uploaded for this
 * purpose and not yet attached, so nobody can reuse someone else's file.
 */
export async function claimUploads(db: Db | Tx, userId: string, purpose: UploadPurpose, keys: string[]) {
  if (keys.length === 0) return;
  const claimed = await db
    .update(uploads)
    .set({ attachedAt: new Date() })
    .where(
      and(
        inArray(uploads.key, keys),
        eq(uploads.userId, userId),
        eq(uploads.purpose, purpose),
        isNull(uploads.attachedAt),
      ),
    )
    .returning({ key: uploads.key });
  if (claimed.length !== new Set(keys).size) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That image upload isn't available. Try adding it again." });
  }
}

/**
 * Deletes files and their upload rows, e.g. a replaced avatar. If storage
 * fails, the rows are detached instead of dropped, so the cleanup cron retries
 * the files later. Errors are logged, never thrown.
 */
export async function discardUploads(db: Db, storage: Storage, keys: Array<string | null | undefined>) {
  const real = keys.filter((k): k is string => Boolean(k));
  if (real.length === 0) return;
  try {
    await storage.deleteObjects(real);
    await db.delete(uploads).where(inArray(uploads.key, real));
  } catch (error) {
    console.error(`couldn't delete ${real.length} stored files; leaving them for cleanup`, error);
    await db
      .update(uploads)
      .set({ attachedAt: null, createdAt: new Date(0) })
      .where(inArray(uploads.key, real))
      .catch(() => undefined);
  }
}

/** Uploads issued over a day ago and never attached: abandoned drafts, cancelled photo picks. */
export async function deleteUnusedUploads(db: Db, storage: Storage, now: Date, limit = 1000) {
  const stale = await db
    .select({ key: uploads.key })
    .from(uploads)
    .where(and(isNull(uploads.attachedAt), lt(uploads.createdAt, new Date(now.getTime() - UNUSED_UPLOAD_TTL_MS))))
    .limit(limit);
  await discardUploads(
    db,
    storage,
    stale.map((s) => s.key),
  );
  return stale.length;
}
