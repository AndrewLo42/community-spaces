import { canReport, createReportInput, type CommentThreadRef } from "@cs/core";
import { and, comments, eq, reports } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { notifyModQueue } from "../lib/notify";
import { loadThread, threadOf } from "../lib/threads";
import { protectedProcedure, router } from "../trpc";

export const reportRouter = router({
  /** Flag a post or comment for the group's moderators. Reports are private to moderators. */
  create: protectedProcedure.input(createReportInput).mutation(async ({ ctx, input }) => {
    // A post is reported as itself; a comment through the post or event it's on.
    let ref: CommentThreadRef = { postId: input.targetId };
    let authorId: string | undefined;
    if (input.targetType === "comment") {
      const [comment] = await ctx.db.select().from(comments).where(eq(comments.id, input.targetId));
      if (!comment || comment.status === "removed") throw new TRPCError({ code: "NOT_FOUND" });
      ref = threadOf(comment);
      authorId = comment.authorId;
    }

    const access = await loadThread(ctx.db, ref, ctx.user.id);
    if (!access?.canView) throw new TRPCError({ code: "NOT_FOUND" });
    authorId ??= access.parent.authorId;
    if (!canReport(access.permissionContext, { authorId })) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can't report this" });
    }

    // One open report per person per item; reporting twice is a no-op.
    const [existing] = await ctx.db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, ctx.user.id),
          eq(reports.targetType, input.targetType),
          eq(reports.targetId, input.targetId),
          eq(reports.status, "open"),
        ),
      );
    if (!existing) {
      await ctx.db.insert(reports).values({
        groupId: access.group.id,
        reporterId: ctx.user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details,
      });
      await notifyModQueue(ctx.db, access.group.id, ctx.user.id);
    }
    return { ok: true };
  }),
});
