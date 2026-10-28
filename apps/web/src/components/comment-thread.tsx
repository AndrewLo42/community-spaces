"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";
import { useTRPC } from "@/trpc/client";
import { Avatar } from "./avatar";
import { ReportDialog } from "./report-dialog";
import { Button, Textarea } from "./ui";

export interface CommentData {
  id: string;
  parentId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  removed: boolean;
  body: string | null;
  author: { id: string; name: string; image: string | null } | null;
  canRemove: boolean;
  canReport: boolean;
  canEdit: boolean;
}

export function CommentThread({
  postId,
  comments,
  canComment,
  locked,
}: {
  postId: string;
  comments: CommentData[];
  canComment: boolean;
  locked: boolean;
}) {
  const topLevel = comments.filter((c) => !c.parentId);
  const replies = new Map<string, CommentData[]>();
  for (const c of comments) {
    if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
  }
  // A removed comment with no replies has nothing left to show.
  const visible = topLevel.filter((c) => !c.removed || replies.has(c.id));
  const count = comments.filter((c) => !c.removed).length;

  return (
    <section className="space-y-5">
      <h2 className="font-serif text-xl font-semibold">
        {count === 0 ? "Comments" : `${count} ${count === 1 ? "comment" : "comments"}`}
      </h2>

      {canComment ? (
        <CommentForm postId={postId} placeholder="Add a comment…" />
      ) : (
        <p className="text-sm text-muted">
          {locked ? "Comments are locked on this post." : "Only members can comment here."}
        </p>
      )}

      <ul className="space-y-5">
        {visible.map((c) => (
          <li key={c.id}>
            <Comment comment={c} postId={postId} canReply={canComment} />
            {replies.get(c.id)?.length ? (
              <ul className="mt-3 space-y-3 border-l-2 border-line pl-4 sm:ml-4">
                {replies.get(c.id)!.filter((r) => !r.removed).map((r) => (
                  <li key={r.id}>
                    <Comment comment={r} postId={postId} canReply={canComment} replyToId={c.id} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Comment({
  comment,
  postId,
  canReply,
  replyToId,
}: {
  comment: CommentData;
  postId: string;
  canReply: boolean;
  /** Replies to a reply go to the thread's top-level comment. */
  replyToId?: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const remove = useMutation(trpc.comment.remove.mutationOptions({ onSuccess: () => router.refresh() }));
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);

  if (comment.removed) {
    return <p className="text-sm italic text-muted">This comment was removed.</p>;
  }

  return (
    <div className="flex gap-3">
      <Avatar name={comment.author?.name} image={comment.author?.image} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{comment.author?.name || "Member"}</span>
          <span className="ml-2 text-xs text-muted">
            {timeAgo(comment.createdAt)}
            {comment.editedAt ? " · edited" : ""}
          </span>
        </p>
        {editing ? (
          <EditCommentForm commentId={comment.id} body={comment.body ?? ""} onDone={() => setEditing(false)} />
        ) : (
          <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed">{comment.body}</p>
        )}
        <div className={editing ? "hidden" : "mt-1 flex gap-3 text-xs text-muted"}>
          {canReply ? (
            <button className="hover:text-fg" onClick={() => setReplying((r) => !r)}>
              Reply
            </button>
          ) : null}
          {comment.canEdit ? (
            <button className="hover:text-fg" onClick={() => setEditing(true)}>
              Edit
            </button>
          ) : null}
          {comment.canRemove ? (
            <button
              className="hover:text-danger"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm("Remove this comment?")) remove.mutate({ commentId: comment.id });
              }}
            >
              Remove
            </button>
          ) : null}
          {comment.canReport ? (
            <button className="hover:text-fg" onClick={() => setReporting(true)}>
              Report
            </button>
          ) : null}
        </div>
        {reporting ? (
          <ReportDialog targetType="comment" targetId={comment.id} onClose={() => setReporting(false)} />
        ) : null}
        {replying ? (
          <div className="mt-2">
            <CommentForm
              postId={postId}
              parentId={replyToId ?? comment.id}
              placeholder={`Reply to ${comment.author?.name || "this comment"}…`}
              autoFocus
              onDone={() => setReplying(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CommentForm({
  postId,
  parentId,
  placeholder,
  autoFocus,
  onDone,
}: {
  postId: string;
  parentId?: string;
  placeholder: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const create = useMutation(trpc.comment.create.mutationOptions());
  const [body, setBody] = useState("");

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { postId, parentId, body },
          {
            onSuccess: () => {
              setBody("");
              onDone?.();
              router.refresh();
            },
          },
        );
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="min-h-16"
        aria-label={placeholder}
      />
      <div className="flex items-center justify-end gap-2">
        {create.error ? <span className="mr-auto text-xs text-danger">{errorMessage(create.error)}</span> : null}
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={!body.trim() || create.isPending}>
          {create.isPending ? "Posting…" : parentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </form>
  );
}

function EditCommentForm({ commentId, body, onDone }: { commentId: string; body: string; onDone: () => void }) {
  const router = useRouter();
  const trpc = useTRPC();
  const update = useMutation(
    trpc.comment.update.mutationOptions({
      onSuccess: () => {
        onDone();
        router.refresh();
      },
    }),
  );
  const [value, setValue] = useState(body);

  return (
    <form
      className="mt-1 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ commentId, body: value });
      }}
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-16"
        autoFocus
        aria-label="Edit comment"
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
        }}
      />
      <div className="flex items-center justify-end gap-2">
        {update.error ? <span className="mr-auto text-xs text-danger">{errorMessage(update.error)}</span> : null}
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!value.trim() || value.trim() === body.trim() || update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
