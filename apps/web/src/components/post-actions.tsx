"use client";

import type { PostView } from "@cs/api";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/trpc/client";
import { EditPostDialog } from "./edit-post-dialog";
import { ReportDialog } from "./report-dialog";
import { Button } from "./ui";

export function PostActions({
  post,
}: {
  post: Pick<PostView, "id" | "body" | "status" | "pinned" | "locked" | "viewer">;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const onSuccess = () => router.refresh();
  const review = useMutation(trpc.post.review.mutationOptions({ onSuccess }));
  const pin = useMutation(trpc.post.setPinned.mutationOptions({ onSuccess }));
  const lock = useMutation(trpc.post.setLocked.mutationOptions({ onSuccess }));
  const remove = useMutation(trpc.post.remove.mutationOptions({ onSuccess }));

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const { canModerate, canRemove, canReport, canEdit } = post.viewer;
  const postId = post.id;

  if (post.status === "pending" && canModerate) {
    return (
      <div className="flex gap-1.5">
        <Button className="px-3 py-1.5" disabled={review.isPending} onClick={() => review.mutate({ postId, approve: true })}>
          Approve
        </Button>
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          disabled={review.isPending}
          onClick={() => review.mutate({ postId, approve: false })}
        >
          Decline
        </Button>
      </div>
    );
  }

  if (!canModerate && !canRemove && !canReport && !canEdit) return null;

  const items: Array<{ label: string; run: () => void; danger?: boolean }> = [];
  if (canEdit) items.push({ label: "Edit post", run: () => setEditing(true) });
  if (canModerate && post.status === "published") {
    items.push({ label: post.pinned ? "Unpin" : "Pin to top", run: () => pin.mutate({ postId, value: !post.pinned }) });
    items.push({
      label: post.locked ? "Unlock comments" : "Lock comments",
      run: () => lock.mutate({ postId, value: !post.locked }),
    });
  }
  if (canReport) items.push({ label: "Report", run: () => setReporting(true) });
  if (canRemove) {
    items.push({
      label: post.status === "pending" ? "Withdraw post" : "Remove post",
      danger: true,
      run: () => {
        if (confirm("Remove this post? Members will no longer see it.")) remove.mutate({ postId });
      },
    });
  }

  return (
    <div ref={menuRef} className="relative">
      <Button variant="ghost" className="px-2 py-1" aria-label="Post options" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden className="text-lg leading-none">⋯</span>
      </Button>
      {open ? (
        <div role="menu" className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-surface-2 ${item.danger ? "text-danger" : ""}`}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {reporting ? <ReportDialog targetType="post" targetId={postId} onClose={() => setReporting(false)} /> : null}
      {editing ? <EditPostDialog postId={postId} body={post.body} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}
