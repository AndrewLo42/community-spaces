"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Dialog } from "./dialog";
import { Button, Textarea } from "./ui";

export function EditPostDialog({ postId, body, onClose }: { postId: string; body: string; onClose: () => void }) {
  const router = useRouter();
  const trpc = useTRPC();
  const update = useMutation(
    trpc.post.update.mutationOptions({
      onSuccess: () => {
        onClose();
        router.refresh();
      },
    }),
  );
  const [value, setValue] = useState(body);

  return (
    <Dialog title="Edit post" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ postId, body: value });
        }}
      >
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-40"
          maxLength={10_000}
          autoFocus
          aria-label="Post text"
        />
        <p className="text-xs text-muted">Photos stay as they are. Members will see that the post was edited.</p>
        {update.error ? <p className="text-sm text-danger">{errorMessage(update.error)}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending || value.trim() === body.trim()}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
