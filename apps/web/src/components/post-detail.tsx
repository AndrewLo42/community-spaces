import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { CommentThread } from "./comment-thread";
import { MarkSeen } from "./mark-seen";
import { PostCard } from "./post-card";

export async function loadPost(postId: string) {
  const api = await serverApi();
  try {
    return await api.post.byId({ postId });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
}

/** A post with its comments. Rendered by the full /p/[id] page and by the modal over a feed. */
export async function PostDetail({ postId }: { postId: string }) {
  const [post, signedIn] = await Promise.all([loadPost(postId), getSessionUser().then(Boolean)]);
  const comments = post.status === "published" ? await (await serverApi()).comment.list({ postId }) : [];

  return (
    <div className="space-y-6">
      <PostCard post={post} linkToPost={false} showGroup />
      {signedIn ? <MarkSeen postId={post.id} /> : null}
      {post.status === "published" ? (
        <CommentThread thread={{ postId: post.id }} comments={comments} canComment={post.viewer.canComment} locked={post.locked} />
      ) : null}
    </div>
  );
}
