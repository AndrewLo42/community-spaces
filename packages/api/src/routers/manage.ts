import { randomBytes } from "node:crypto";
import {
  can,
  canChangeRole,
  canModerateMember,
  createInviteInput,
  groupIdInput,
  groupPermissions,
  inviteIdInput,
  memberTargetInput,
  MEMBER_ROLES,
  removeMemberInput,
  resolveReportInput,
  reviewRequestInput,
  roleRank,
  setRoleInput,
  updateGroupInput,
} from "@cs/core";
import {
  and,
  asc,
  comments,
  count,
  desc,
  eq,
  groups,
  inArray,
  invites,
  isNull,
  memberships,
  posts,
  reports,
  sql,
  users,
  type Db,
} from "@cs/db";
import { TRPCError } from "@trpc/server";
import { requireGroupAction } from "../lib/access";
import { removeComment, removePost } from "../lib/moderation";
import { findPosts, toPostView } from "../lib/posts";
import { protectedProcedure, router } from "../trpc";

const MAX_MEMBERS_LISTED = 1000;

async function findMembership(db: Db, groupId: string, userId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
  return m ?? null;
}

const adjustMemberCount = (delta: 1 | -1) => ({ memberCount: sql`${groups.memberCount} + ${delta}` });

export const manageRouter = router({
  /** Counts for the manage page tabs and the group header. */
  overview: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    const access = await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "group:manage");
    const [[requests], [pendingPosts], [openReports]] = await Promise.all([
      ctx.db
        .select({ n: count() })
        .from(memberships)
        .where(and(eq(memberships.groupId, input.groupId), eq(memberships.status, "pending"))),
      ctx.db
        .select({ n: count() })
        .from(posts)
        .where(and(eq(posts.groupId, input.groupId), eq(posts.status, "pending"))),
      ctx.db
        .select({ n: count() })
        .from(reports)
        .where(and(eq(reports.groupId, input.groupId), eq(reports.status, "open"))),
    ]);
    const { searchVector: _sv, ...group } = access.group;
    return {
      group,
      role: access.membership!.role,
      permissions: groupPermissions(access.permissionContext),
      counts: { requests: requests?.n ?? 0, pendingPosts: pendingPosts?.n ?? 0, openReports: openReports?.n ?? 0 },
    };
  }),

  // ─── Join requests ─────────────────────────────────────────────────────────

  requests: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "member:review");
    return ctx.db
      .select({
        userId: users.id,
        name: users.name,
        image: users.image,
        bio: users.bio,
        message: memberships.requestMessage,
        requestedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.groupId, input.groupId), eq(memberships.status, "pending")))
      .orderBy(asc(memberships.createdAt));
  }),

  reviewRequest: protectedProcedure.input(reviewRequestInput).mutation(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "member:review");
    const target = await findMembership(ctx.db, input.groupId, input.userId);
    if (target?.status !== "pending") throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

    const where = and(eq(memberships.groupId, input.groupId), eq(memberships.userId, input.userId));
    if (!input.approve) {
      await ctx.db.delete(memberships).where(where);
      return { ok: true };
    }
    await ctx.db.transaction(async (tx) => {
      await tx.update(memberships).set({ status: "active", requestMessage: null }).where(where);
      await tx.update(groups).set(adjustMemberCount(1)).where(eq(groups.id, input.groupId));
    });
    return { ok: true };
  }),

  // ─── Members ───────────────────────────────────────────────────────────────

  members: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    const access = await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "group:manage");
    const actorRole = access.membership!.role;

    const rows = await ctx.db
      .select({
        userId: users.id,
        name: users.name,
        image: users.image,
        role: memberships.role,
        status: memberships.status,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.groupId, input.groupId), inArray(memberships.status, ["active", "banned"])))
      .orderBy(asc(users.name))
      .limit(MAX_MEMBERS_LISTED);

    return rows
      .map((m) => {
        const target = { userId: m.userId, role: m.role };
        const active = m.status === "active";
        return {
          ...m,
          isSelf: m.userId === ctx.user.id,
          /** Roles the viewer may move this member to. */
          assignableRoles: active
            ? MEMBER_ROLES.filter((r) => r !== m.role && canChangeRole(actorRole, m.role, r))
            : [],
          canRemove: active && canModerateMember(access.permissionContext, target),
          canUnban: m.status === "banned" && can(access.permissionContext, "member:ban"),
        };
      })
      .sort((a, b) => (a.status === b.status ? roleRank(b.role) - roleRank(a.role) : a.status === "active" ? -1 : 1));
  }),

  setRole: protectedProcedure.input(setRoleInput).mutation(async ({ ctx, input }) => {
    const access = await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "group:manage");
    const target = await findMembership(ctx.db, input.groupId, input.userId);
    if (target?.status !== "active" || !canChangeRole(access.membership!.role, target.role, input.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can't change this member's role" });
    }
    await ctx.db
      .update(memberships)
      .set({ role: input.role })
      .where(and(eq(memberships.groupId, input.groupId), eq(memberships.userId, input.userId)));
    return { ok: true };
  }),

  /** Remove a member (they may rejoin) or ban them (they can't). Also used to block a requester. */
  removeMember: protectedProcedure.input(removeMemberInput).mutation(async ({ ctx, input }) => {
    const access = await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "group:manage");
    const target = await findMembership(ctx.db, input.groupId, input.userId);
    if (!target || target.status === "banned" || !canModerateMember(access.permissionContext, target)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can't remove this member" });
    }

    const where = and(eq(memberships.groupId, input.groupId), eq(memberships.userId, input.userId));
    await ctx.db.transaction(async (tx) => {
      if (input.ban) {
        await tx.update(memberships).set({ status: "banned", role: "member", requestMessage: null }).where(where);
      } else {
        await tx.delete(memberships).where(where);
      }
      if (target.status === "active") {
        await tx.update(groups).set(adjustMemberCount(-1)).where(eq(groups.id, input.groupId));
      }
    });
    return { ok: true };
  }),

  unban: protectedProcedure.input(memberTargetInput).mutation(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "member:ban");
    await ctx.db
      .delete(memberships)
      .where(
        and(
          eq(memberships.groupId, input.groupId),
          eq(memberships.userId, input.userId),
          eq(memberships.status, "banned"),
        ),
      );
    return { ok: true };
  }),

  // ─── Content ───────────────────────────────────────────────────────────────

  pendingPosts: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    const access = await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "post:moderate");
    const rows = await findPosts(ctx.db, and(eq(posts.groupId, input.groupId), eq(posts.status, "pending")));
    // Oldest first: a queue, not a feed.
    return rows.reverse().map((r) => toPostView(r, access.permissionContext, ctx.storage));
  }),

  /** Open reports, grouped by the content they're about. */
  reports: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "report:review");
    const open = await ctx.db
      .select({
        id: reports.id,
        targetType: reports.targetType,
        targetId: reports.targetId,
        reason: reports.reason,
        details: reports.details,
        createdAt: reports.createdAt,
        reporterName: users.name,
      })
      .from(reports)
      .innerJoin(users, eq(users.id, reports.reporterId))
      .where(and(eq(reports.groupId, input.groupId), eq(reports.status, "open")))
      .orderBy(asc(reports.createdAt));
    if (open.length === 0) return [];

    const postIds = open.filter((r) => r.targetType === "post").map((r) => r.targetId);
    const commentIds = open.filter((r) => r.targetType === "comment").map((r) => r.targetId);
    const [reportedPosts, reportedComments] = await Promise.all([
      postIds.length
        ? ctx.db
            .select({ id: posts.id, body: posts.body, status: posts.status, authorName: users.name, postId: posts.id })
            .from(posts)
            .innerJoin(users, eq(users.id, posts.authorId))
            .where(inArray(posts.id, postIds))
        : [],
      commentIds.length
        ? ctx.db
            .select({
              id: comments.id,
              body: comments.body,
              status: comments.status,
              authorName: users.name,
              postId: comments.postId,
            })
            .from(comments)
            .innerJoin(users, eq(users.id, comments.authorId))
            .where(inArray(comments.id, commentIds))
        : [],
    ]);
    const content = new Map([...reportedPosts, ...reportedComments].map((c) => [c.id, c]));

    const grouped = new Map<string, { targetType: "post" | "comment"; targetId: string; reports: typeof open }>();
    for (const r of open) {
      const key = `${r.targetType}:${r.targetId}`;
      const entry = grouped.get(key) ?? { targetType: r.targetType, targetId: r.targetId, reports: [] };
      entry.reports.push(r);
      grouped.set(key, entry);
    }

    return [...grouped.values()]
      .map((g) => {
        const c = content.get(g.targetId);
        return {
          targetType: g.targetType,
          targetId: g.targetId,
          content: c
            ? { body: c.body, authorName: c.authorName, postId: c.postId, removed: c.status === "removed" }
            : null,
          reports: g.reports.map(({ id, reason, details, createdAt, reporterName }) => ({
            id,
            reason,
            details,
            createdAt,
            reporterName,
          })),
        };
      })
      // Most-reported first.
      .sort((a, b) => b.reports.length - a.reports.length);
  }),

  resolveReport: protectedProcedure.input(resolveReportInput).mutation(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "report:review");

    if (input.action === "remove") {
      if (input.targetType === "post") {
        // Content that no longer exists just has its reports closed.
        const [post] = await ctx.db.select().from(posts).where(eq(posts.id, input.targetId));
        if (post && post.groupId !== input.groupId) throw new TRPCError({ code: "NOT_FOUND" });
        if (post) await removePost(ctx.db, post.id);
      } else {
        const [row] = await ctx.db
          .select({ comment: comments, groupId: posts.groupId })
          .from(comments)
          .innerJoin(posts, eq(posts.id, comments.postId))
          .where(eq(comments.id, input.targetId));
        if (row && row.groupId !== input.groupId) throw new TRPCError({ code: "NOT_FOUND" });
        if (row) await removeComment(ctx.db, row.comment);
      }
    }

    await ctx.db
      .update(reports)
      .set({ status: input.action === "remove" ? "resolved" : "dismissed", resolvedById: ctx.user.id })
      .where(
        and(
          eq(reports.groupId, input.groupId),
          eq(reports.targetType, input.targetType),
          eq(reports.targetId, input.targetId),
          eq(reports.status, "open"),
        ),
      );
    return { ok: true };
  }),

  // ─── Settings ──────────────────────────────────────────────────────────────

  updateSettings: protectedProcedure.input(updateGroupInput).mutation(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "group:editSettings");
    const { groupId, ...settings } = input;
    await ctx.db.update(groups).set(settings).where(eq(groups.id, groupId));
    return { ok: true };
  }),

  // ─── Invites ───────────────────────────────────────────────────────────────

  invites: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "invite:manage");
    return ctx.db
      .select({
        id: invites.id,
        code: invites.code,
        uses: invites.uses,
        maxUses: invites.maxUses,
        expiresAt: invites.expiresAt,
        createdAt: invites.createdAt,
        createdByName: users.name,
      })
      .from(invites)
      .leftJoin(users, eq(users.id, invites.createdById))
      .where(and(eq(invites.groupId, input.groupId), isNull(invites.revokedAt)))
      .orderBy(desc(invites.createdAt));
  }),

  createInvite: protectedProcedure.input(createInviteInput).mutation(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "invite:manage");
    const [invite] = await ctx.db
      .insert(invites)
      .values({
        groupId: input.groupId,
        code: randomBytes(8).toString("base64url"),
        createdById: ctx.user.id,
        maxUses: input.maxUses,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      })
      .returning({ code: invites.code });
    return invite!;
  }),

  revokeInvite: protectedProcedure.input(inviteIdInput).mutation(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "invite:manage");
    await ctx.db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.id, input.inviteId), eq(invites.groupId, input.groupId)));
    return { ok: true };
  }),
});
