import { PostDetail } from "@/components/post-detail";
import { PostModal } from "@/components/post-modal";

// Clicking a post from a feed, notifications or the review queue lands here
// instead of /p/[id]: the post opens over the page, which stays mounted, so
// closing it returns to the same scroll position.
export default async function InterceptedPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PostModal postId={id}>
      <PostDetail postId={id} />
    </PostModal>
  );
}
