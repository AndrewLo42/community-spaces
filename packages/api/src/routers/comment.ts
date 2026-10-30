import {
  canEditComment,
  canRemoveContent,
  canReport,
  commentIdInput,
  commentThreadInput,
  createCommentInput,
  updateCommentInput,
} from "@cs/core";
import { and, asc, comments, eq } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { removeComment } from "../lib/moderation";
import { notify } from "../lib/notify";
import { bumpCommentCount, inThread, loadThread, threadColumns, threadOf } from "../lib/threads";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const MAX_COMMENTS = 500;

export const commentRouter = router({
  /** All comments on a post or event, oldest first. Threads are one level deep. */
  list: publicProcedure.input(commentThreadInput).query(async ({ ctx, input }) => {
    const access = await loadThread(ctx.db, input, ctx.user?.id ?? null);
    if (!access?.canView) throw new TRPCError({ code: "NOT_FOUND" });

    const rows = await ctx.db.query.comments.findMany({
      where: inThread(input),
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
        editedAt: removed ? null : c.editedAt,
        removed,
        // Removed comments keep their place in the thread but lose their content.
        body: removed ? null : c.body,
        author: removed ? null : c.author,
        canRemove: !removed && canRemoveContent(access.permissionContext, c),
        canReport: !removed && canReport(access.permissionContext, c),
        canEdit: canEditComment(access.permissionContext, c, access.parent),
      };
    });
  }),

  create: protectedProcedure.input(createCommentInput).mutation(async ({ ctx, input }) => {
    const { parentId: replyTo, body, ...ref } = input;
    const access = await loadThread(ctx.db, ref, ctx.user.id);
    if (!access?.canView || !access.canComment) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can't comment here" });
    }

    // Replies to a reply attach to the top-level comment, keeping threads one level deep.
    let parentId: string | null = null;
    let repliedToAuthorId: string | null = null;
    if (replyTo) {
      const [parent] = await ctx.db
        .select({ id: comments.id, parentId: comments.parentId, authorId: comments.authorId })
        .from(comments)
        .where(and(eq(comments.id, replyTo), inThread(ref)));
      if (!parent) throw new TRPCError({ code: "BAD_REQUEST", message: "That comment no longer exists" });
      parentId = parent.parentId ?? parent.id;
      repliedToAuthorId = parent.authorId;
    }

    const created = await ctx.db.transaction(async (tx) => {
      const [comment] = await tx
        .insert(comments)
        .values({ ...threadColumns(ref), authorId: ctx.user.id, parentId, body })
        .returning({ id: comments.id });
      await bumpCommentCount(tx, ref, 1);
      return comment!;
    });

    const event = { groupId: access.group.id, ...access.notifyFields, actorId: ctx.user.id };
    if (repliedToAuthorId) {
      await notify(ctx.db, [repliedToAuthorId], { ...event, type: "reply", groupKey: `reply:${replyTo}` });
    }
    // The post's author (or event's organizer) hears about every comment, unless the reply notice already reached them.
    const { owner } = access;
    if (owner && owner.userId !== repliedToAuthorId) {
      await notify(ctx.db, [owner.userId], { ...event, type: owner.type, groupKey: owner.groupKey, data: owner.data });
    }
    return created;
  }),

  update: protectedProcedure.input(updateCommentInput).mutation(async ({ ctx, input }) => {
    const [comment] = await ctx.db.select().from(comments).where(eq(comments.id, input.commentId));
    if (!comment) throw new TRPCError({ code: "NOT_FOUND" });
    const access = await loadThread(ctx.db, threadOf(comment), ctx.user.id);
    if (!access?.canView || !canEditComment(access.permissionContext, comment, access.parent)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can't edit this comment" });
    }
    if (input.body !== comment.body) {
      await ctx.db
        .update(comments)
        .set({ body: input.body, editedAt: new Date() })
        .where(eq(comments.id, input.commentId));
    }
    return { ok: true };
  }),

  remove: protectedProcedure.input(commentIdInput).mutation(async ({ ctx, input }) => {
    const [comment] = await ctx.db.select().from(comments).where(eq(comments.id, input.commentId));
    if (!comment || comment.status === "removed") throw new TRPCError({ code: "NOT_FOUND" });
    const access = await loadThread(ctx.db, threadOf(comment), ctx.user.id);
    if (!access?.canView || !canRemoveContent(access.permissionContext, comment)) throw new TRPCError({ code: "FORBIDDEN" });

    await removeComment(ctx.db, comment);
    return { ok: true };
  }),
});
