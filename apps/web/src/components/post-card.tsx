import type { PostView } from "@cs/api";
import { placeLabel } from "@cs/core";
import Link from "next/link";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./avatar";
import { PostActions } from "./post-actions";
import { PostImages } from "./post-images";
import { Card, cx } from "./ui";

export function PostCard({
  post,
  showGroup = false,
  linkToPost = true,
}: {
  post: PostView;
  /** On the home feed, say which group each post came from. */
  showGroup?: boolean;
  linkToPost?: boolean;
}) {
  const href = `/p/${post.id}`;

  return (
    <Card className={cx("p-4 sm:p-5", post.status === "pending" && "border-dashed")}>
      <header className="flex items-start gap-3">
        <Avatar name={post.author.name} image={post.author.image} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="leading-tight">
            <span className="font-medium">{post.author.name || "Member"}</span>
            {post.author.place ? <span className="text-xs text-muted"> · {placeLabel(post.author.place)}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {showGroup ? (
              <>
                <Link href={`/g/${post.group.slug}`} className="font-medium hover:underline" style={{ color: post.group.accentColor }}>
                  {post.group.name}
                </Link>
                {" · "}
              </>
            ) : null}
            <time dateTime={post.createdAt.toISOString()}>{timeAgo(post.createdAt)}</time>
            {post.editedAt ? <span title={`Edited ${timeAgo(post.editedAt)}`}> · edited</span> : null}
            {post.pinned ? " · Pinned" : ""}
            {post.locked ? " · Comments locked" : ""}
          </p>
        </div>
        <PostActions post={post} />
      </header>

      {post.status === "pending" ? (
        <p className="mt-3 rounded-md bg-surface-2 px-3 py-1.5 text-xs text-muted">Waiting for a moderator to approve</p>
      ) : null}

      {post.body ? <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-relaxed">{post.body}</p> : null}

      {post.images.length > 0 ? <PostImages images={post.images} /> : null}

      {linkToPost && post.status === "published" ? (
        <footer className="mt-4 border-t border-line pt-3 text-sm">
          <Link href={href} className="text-muted hover:text-fg">
            {post.commentCount === 0
              ? post.viewer.canComment
                ? "Comment"
                : "View post"
              : `${post.commentCount} ${post.commentCount === 1 ? "comment" : "comments"}`}
          </Link>
        </footer>
      ) : null}
    </Card>
  );
}
