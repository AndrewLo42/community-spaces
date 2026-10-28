import { canReport, canViewPost, createReportInput } from "@cs/core";
import { and, comments, eq, reports } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { loadPostAccess } from "../lib/access";
import { notifyModQueue } from "../lib/notify";
import { protectedProcedure, router } from "../trpc";

export const reportRouter = router({
  /** Flag a post or comment for the group's moderators. Reports are private to moderators. */
  create: protectedProcedure.input(createReportInput).mutation(async ({ ctx, input }) => {
    let postId = input.targetId;
    let authorId: string;
    if (input.targetType === "comment") {
      const [comment] = await ctx.db.select().from(comments).where(eq(comments.id, input.targetId));
      if (!comment || comment.status === "removed") throw new TRPCError({ code: "NOT_FOUND" });
      postId = comment.postId;
      authorId = comment.authorId;
    }

    const access = await loadPostAccess(ctx.db, postId, ctx.user.id);
    if (!access || !canViewPost(access.permissionContext, access.post)) throw new TRPCError({ code: "NOT_FOUND" });
    authorId ??= access.post.authorId;
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
