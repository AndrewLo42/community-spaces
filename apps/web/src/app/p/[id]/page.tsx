import type { Metadata } from "next";
import Link from "next/link";
import { loadPost, PostDetail } from "@/components/post-detail";

// The full page for a post: opened from a shared link, a refresh, or a new tab.
// Clicking a post inside the app opens @modal/(.)p/[id] over the feed instead.

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const post = await loadPost((await params).id);
  const title = post.body.slice(0, 60) || `Post in ${post.group.name}`;
  return { title };
}

export default async function PostPage({ params }: { params: Params }) {
  const { id } = await params;
  const post = await loadPost(id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={`/g/${post.group.slug}`} className="text-sm text-muted hover:text-fg">
        ← {post.group.name}
      </Link>
      <PostDetail postId={id} />
    </div>
  );
}
