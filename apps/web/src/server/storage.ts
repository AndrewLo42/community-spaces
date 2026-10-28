import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Storage } from "@cs/api/storage";
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
  };
}

export const storage: Storage = isR2Configured ? r2Storage() : localStorage();
