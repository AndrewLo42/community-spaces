"use client";

import { AVATAR_SIZE, type UploadPurpose } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { prepareImage } from "./images";

export interface UploadedImage {
  key: string;
  width: number;
  height: number;
}

/** Prepares a picked file in the browser, then PUTs it straight to storage. */
export function useImageUpload(purpose: UploadPurpose) {
  const trpc = useTRPC();
  const createUrl = useMutation(trpc.upload.createUrl.mutationOptions());

  return async (file: File): Promise<UploadedImage> => {
    const prepared = await prepareImage(file, purpose === "avatar" ? { square: AVATAR_SIZE } : {});
    const target = await createUrl.mutateAsync({ purpose, contentType: prepared.contentType, size: prepared.blob.size });
    const res = await fetch(target.url, { method: "PUT", headers: target.headers, body: prepared.blob });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return { key: target.key, width: prepared.width, height: prepared.height };
  };
}
