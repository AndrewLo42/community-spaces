import { comments, eq, posts, type Db } from "@cs/db";
import { bumpCommentCount, threadOf } from "./threads";

// Removal is a soft delete: content disappears for everyone but stays in the
// database for moderators' records and so reports keep their context.

export async function removePost(db: Db, postId: string) {
  await db.update(posts).set({ status: "removed" }).where(eq(posts.id, postId));
}

export async function removeComment(
  db: Db,
  comment: { id: string; postId: string | null; eventId: string | null; status: string },
) {
  if (comment.status === "removed") return;
  await db.transaction(async (tx) => {
    await tx.update(comments).set({ status: "removed" }).where(eq(comments.id, comment.id));
    await bumpCommentCount(tx, threadOf(comment), -1);
  });
}
