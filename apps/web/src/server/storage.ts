import { rm } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UPLOAD_KEY_PATTERN, type Storage } from "@cs/api/storage";
import { findRepoRoot } from "@cs/db";

export const isR2Configured = Boolean(process.env.R2_BUCKET);

/** Local dev: files go to .data/uploads via /api/uploads/[...key]. */
export const localUploadDir = path.join(findRepoRoot(), ".data", "uploads");

function localStorage(): Storage {
  return {
    async createUpload({ key, contentType }) {
      return { url: `/api/uploads/${key}`, headers: { "Content-Type": contentType } };
    },
    publicUrl: (key) => `/api/uploads/${key}`,
    async deleteObjects(keys) {
      // The pattern check keeps a bad key from ever pointing outside the uploads folder.
      const safe = keys.filter((k) => UPLOAD_KEY_PATTERN.test(k));
      await Promise.all(safe.map((k) => rm(path.join(localUploadDir, k), { force: true })));
    },
  };
}

function r2Storage(): Storage {
  const bucket = process.env.R2_BUCKET!;
  const publicBase = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  return {
    async createUpload({ key, contentType, size }) {
      // ContentLength is part of the signature, so the client can't upload more than it declared.
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size });
      const url = await getSignedUrl(client, command, { expiresIn: 300 });
      return { url, headers: { "Content-Type": contentType } };
    },
    publicUrl: (key) => `${publicBase}/${key}`,
    async deleteObjects(keys) {
      // S3's batch delete takes up to 1000 keys per request.
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
        await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } }));
      }
    },
  };
}

export const storage: Storage = isR2Configured ? r2Storage() : localStorage();
