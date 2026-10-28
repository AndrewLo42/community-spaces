import { canCommentOnPost, canRemoveContent, canViewPost, commentIdInput, createCommentInput, postIdInput } from "@cs/core";
import { and, asc, comments, eq, posts, sql } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { loadPostAccess } from "../lib/access";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const MAX_COMMENTS = 500;

export const commentRouter = router({
  /** All comments on a post, oldest first. Threads are one level deep. */
  list: publicProcedure.input(postIdInput).query(async ({ ctx, input }) => {
    const access = await loadPostAccess(ctx.db, input.postId, ctx.user?.id ?? null);
    if (!access || !canViewPost(access.permissionContext, access.post)) throw new TRPCError({ code: "NOT_FOUND" });

    const rows = await ctx.db.query.comments.findMany({
      where: eq(comments.postId, input.postId),
      orderBy: [asc(comments.createdAt)],
      limit: MAX_COMMENTS,
      with: { author: { columns: { id: true, name: true, image: true } } },
    });

    return rows.map((c) => {
      const removed = c.status === "removed";
      return {
        id: c.id,
        parentId: c.parentId,
        createdAt: c.createdAt,
        removed,
        // Removed comments keep their place in the thread but lose their content.
        body: removed ? null : c.body,
        author: removed ? null : c.author,
        canRemove: !removed && canRemoveContent(access.permissionContext, c),
      };
    });
  }),

  create: protectedProcedure.input(createCommentInput).mutation(async ({ ctx, input }) => {
    const access = await loadPostAccess(ctx.db, input.postId, ctx.user.id);
    if (
      !access ||
      !canViewPost(access.permissionContext, access.post) ||
      !canCommentOnPost(access.permissionContext, access.post)
    ) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can't comment on this post" });
    }

    // Replies to a reply attach to the top-level comment, keeping threads one level deep.
    let parentId: string | null = null;
    if (input.parentId) {
      const [parent] = await ctx.db
        .select({ id: comments.id, parentId: comments.parentId })
        .from(comments)
        .where(and(eq(comments.id, input.parentId), eq(comments.postId, input.postId)));
      if (!parent) throw new TRPCError({ code: "BAD_REQUEST", message: "That comment no longer exists" });
      parentId = parent.parentId ?? parent.id;
    }

    return ctx.db.transaction(async (tx) => {
      const [comment] = await tx
        .insert(comments)
        .values({ postId: input.postId, authorId: ctx.user.id, parentId, body: input.body })
        .returning({ id: comments.id });
      await tx
        .update(posts)
        .set({ commentCount: sql`${posts.commentCount} + 1` })
        .where(eq(posts.id, input.postId));
      return comment!;
    });
  }),

  remove: protectedProcedure.input(commentIdInput).mutation(async ({ ctx, input }) => {
    const [comment] = await ctx.db.select().from(comments).where(eq(comments.id, input.commentId));
    if (!comment || comment.status === "removed") throw new TRPCError({ code: "NOT_FOUND" });
    const access = await loadPostAccess(ctx.db, comment.postId, ctx.user.id);
    if (!access || !canRemoveContent(access.permissionContext, comment)) throw new TRPCError({ code: "FORBIDDEN" });

    await ctx.db.transaction(async (tx) => {
      await tx.update(comments).set({ status: "removed" }).where(eq(comments.id, input.commentId));
      await tx
        .update(posts)
        .set({ commentCount: sql`${posts.commentCount} - 1` })
        .where(eq(posts.id, comment.postId));
    });
    return { ok: true };
  }),
});
