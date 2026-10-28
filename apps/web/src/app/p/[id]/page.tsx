import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentThread } from "@/components/comment-thread";
import { PostCard } from "@/components/post-card";
import { serverApi } from "@/server/api";

type Params = Promise<{ id: string }>;

async function loadPost(postId: string) {
  const api = await serverApi();
  try {
    return await api.post.byId({ postId });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const post = await loadPost((await params).id);
  const title = post.body.slice(0, 60) || `Post in ${post.group.name}`;
  return { title };
}

export default async function PostPage({ params }: { params: Params }) {
  const { id } = await params;
  const post = await loadPost(id);
  const comments = post.status === "published" ? await (await serverApi()).comment.list({ postId: id }) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={`/g/${post.group.slug}`} className="text-sm text-muted hover:text-fg">
        ← {post.group.name}
      </Link>
      <PostCard post={post} linkToPost={false} />
      {post.status === "published" ? (
        <CommentThread postId={post.id} comments={comments} canComment={post.viewer.canComment} locked={post.locked} />
      ) : null}
    </div>
  );
}
