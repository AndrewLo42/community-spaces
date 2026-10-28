"use client";

import { MAX_POST_IMAGES } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { prepareImage } from "@/lib/images";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Button, Card, Textarea } from "./ui";

interface Attachment {
  id: string;
  previewUrl: string;
  state: "uploading" | "ready" | "failed";
  image?: { key: string; width: number; height: number };
}

export function PostComposer({ groupId, needsApproval }: { groupId: string; needsApproval: boolean }) {
  const router = useRouter();
  const trpc = useTRPC();
  const createUpload = useMutation(trpc.post.createUploadUrl.mutationOptions());
  const createPost = useMutation(trpc.post.create.mutationOptions());

  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Free preview object URLs when the composer unmounts.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(() => () => attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl)), []);

  const update = (id: string, patch: Partial<Attachment>) =>
    setAttachments((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  async function upload(file: File, id: string) {
    try {
      const prepared = await prepareImage(file);
      const target = await createUpload.mutateAsync({ contentType: prepared.contentType, size: prepared.blob.size });
      const res = await fetch(target.url, { method: "PUT", headers: target.headers, body: prepared.blob });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      update(id, { state: "ready", image: { key: target.key, width: prepared.width, height: prepared.height } });
    } catch {
      update(id, { state: "failed" });
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_POST_IMAGES - attachments.length;
    const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
    const added = picked.map((file) => ({
      file,
      attachment: { id: crypto.randomUUID(), previewUrl: URL.createObjectURL(file), state: "uploading" as const },
    }));
    setAttachments((list) => [...list, ...added.map((a) => a.attachment)]);
    added.forEach(({ file, attachment }) => void upload(file, attachment.id));
  }

  function removeAttachment(id: string) {
    setAttachments((list) => {
      const target = list.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return list.filter((a) => a.id !== id);
    });
  }

  const uploading = attachments.some((a) => a.state === "uploading");
  const ready = attachments.filter((a) => a.state === "ready" && a.image);
  const canSubmit = !uploading && !createPost.isPending && (body.trim().length > 0 || ready.length > 0);
  const errors = fieldErrors(createPost.error);

  return (
    <Card className="p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setNotice(null);
          createPost.mutate(
            { groupId, body, images: ready.map((a) => a.image!) },
            {
              onSuccess: ({ status }) => {
                attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
                setAttachments([]);
                setBody("");
                if (status === "pending") setNotice("Thanks! A moderator will review your post before it appears.");
                router.refresh();
              },
            },
          );
        }}
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share an update, ask a question, post an event…"
          className="min-h-20 resize-y border-0 bg-transparent px-0 focus:ring-0"
          aria-label="Post text"
        />

        {attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="relative size-20 overflow-hidden rounded-lg bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.previewUrl} alt="" className={`size-full object-cover ${a.state !== "ready" ? "opacity-50" : ""}`} />
                {a.state === "uploading" ? (
                  <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-center text-[10px] text-white">Uploading…</span>
                ) : null}
                {a.state === "failed" ? (
                  <span className="absolute inset-x-0 bottom-0 bg-danger py-0.5 text-center text-[10px] text-white">Failed</span>
                ) : null}
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => removeAttachment(a.id)}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={attachments.length >= MAX_POST_IMAGES}
            onClick={() => fileInput.current?.click()}
          >
            Add photos
          </Button>
          <span className="text-xs text-muted">
            {needsApproval ? "Posts here are reviewed by moderators." : ""}
          </span>
          <Button type="submit" className="ml-auto" disabled={!canSubmit}>
            {createPost.isPending ? "Posting…" : "Post"}
          </Button>
        </div>

        {createPost.error ? (
          <p className="mt-2 text-sm text-danger">{errors.body ?? errorMessage(createPost.error)}</p>
        ) : null}
        {notice ? <p className="mt-2 text-sm text-muted">{notice}</p> : null}
      </form>
    </Card>
  );
}
