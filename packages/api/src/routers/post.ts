import { randomUUID } from "node:crypto";
import {
  can,
  canRemoveContent,
  canViewPost,
  createPostInput,
  createUploadInput,
  feedInput,
  groupFeedInput,
  postFlagInput,
  postIdInput,
  reviewPostInput,
  type MemberRole,
  type PermissionContext,
} from "@cs/core";
import { and, eq, inArray, memberships, postImages, posts } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { loadGroupAccess, loadPostAccess } from "../lib/access";
import { afterCursor, FEED_PAGE_SIZE, findPosts, paginate, toPostView } from "../lib/posts";
import { userUploadPrefix } from "../storage";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const extensions = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" } as const;

export const postRouter = router({
  /** A group's feed. The first page also carries pinned posts and pending posts the viewer may see. */
  groupFeed: publicProcedure.input(groupFeedInput).query(async ({ ctx, input }) => {
    const userId = ctx.user?.id ?? null;
    const access = await loadGroupAccess(ctx.db, { id: input.groupId }, userId);
    if (!access || !can(access.permissionContext, "group:read")) throw new TRPCError({ code: "FORBIDDEN" });

    const pc = access.permissionContext;
    const inGroup = eq(posts.groupId, input.groupId);
    const published = eq(posts.status, "published");
    const rows = await findPosts(
      ctx.db,
      and(inGroup, published, eq(posts.pinned, false), afterCursor(input.cursor)),
      FEED_PAGE_SIZE + 1,
    );
    const { page, nextCursor } = paginate(rows);

    const isFirstPage = !input.cursor;
    const pinned = isFirstPage ? await findPosts(ctx.db, and(inGroup, published, eq(posts.pinned, true))) : [];
    const pending =
      isFirstPage && userId
        ? await findPosts(
            ctx.db,
            and(
              inGroup,
              eq(posts.status, "pending"),
              can(pc, "post:moderate") ? undefined : eq(posts.authorId, userId),
            ),
          )
        : [];

    const view = (r: (typeof rows)[number]) => toPostView(r, pc, ctx.storage);
    return { pinned: pinned.map(view), pending: pending.map(view), posts: page.map(view), nextCursor };
  }),

  /** Newest posts across every group the viewer belongs to. No ranking, ever. */
  homeFeed: protectedProcedure.input(feedInput).query(async ({ ctx, input }) => {
    const mine = await ctx.db
      .select({ groupId: memberships.groupId, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, ctx.user.id), eq(memberships.status, "active")));
    if (mine.length === 0) return { posts: [], nextCursor: null };

    const roles = new Map<string, MemberRole>(mine.map((m) => [m.groupId, m.role]));
    const rows = await findPosts(
      ctx.db,
      and(
        inArray(posts.groupId, [...roles.keys()]),
        eq(posts.status, "published"),
        afterCursor(input.cursor),
      ),
      FEED_PAGE_SIZE + 1,
    );
    const { page, nextCursor } = paginate(rows);

    return {
      posts: page.map((r) => {
        const pc: PermissionContext = {
          userId: ctx.user.id,
          group: r.group,
          membership: { role: roles.get(r.groupId)!, status: "active" },
        };
        return toPostView(r, pc, ctx.storage);
      }),
      nextCursor,
    };
  }),

  byId: publicProcedure.input(postIdInput).query(async ({ ctx, input }) => {
    const access = await loadPostAccess(ctx.db, input.postId, ctx.user?.id ?? null);
    if (!access || !canViewPost(access.permissionContext, access.post)) throw new TRPCError({ code: "NOT_FOUND" });
    const [row] = await findPosts(ctx.db, eq(posts.id, input.postId), 1);
    return toPostView(row!, access.permissionContext, ctx.storage);
  }),

  /** Step 1 of attaching a photo: get somewhere to PUT the (already resized) file. */
  createUploadUrl: protectedProcedure.input(createUploadInput).mutation(async ({ ctx, input }) => {
    const key = `${userUploadPrefix(ctx.user.id)}${randomUUID()}.${extensions[input.contentType]}`;
    const upload = await ctx.storage.createUpload({ key, contentType: input.contentType, size: input.size });
    return { key, ...upload };
  }),

  create: protectedProcedure.input(createPostInput).mutation(async ({ ctx, input }) => {
    const access = await loadGroupAccess(ctx.db, { id: input.groupId }, ctx.user.id);
    if (!access || !can(access.permissionContext, "post:create")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can't post in this group" });
    }
    const prefix = userUploadPrefix(ctx.user.id);
    if (input.images.some((img) => !img.key.startsWith(prefix))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image" });
    }

    const status = can(access.permissionContext, "post:publishWithoutApproval") ? "published" : "pending";
    const post = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(posts)
        .values({ groupId: input.groupId, authorId: ctx.user.id, body: input.body, status })
        .returning({ id: posts.id });
      if (input.images.length > 0) {
        await tx.insert(postImages).values(
          input.images.map((img, position) => ({
            postId: created!.id,
            storageKey: img.key,
            width: img.width,
            height: img.height,
            position,
          })),
        );
      }
      return created!;
    });
    return { id: post.id, status };
  }),

  remove: protectedProcedure.input(postIdInput).mutation(async ({ ctx, input }) => {
    const access = await loadPostAccess(ctx.db, input.postId, ctx.user.id);
    if (!access || !canRemoveContent(access.permissionContext, access.post)) throw new TRPCError({ code: "FORBIDDEN" });
    await ctx.db.update(posts).set({ status: "removed" }).where(eq(posts.id, input.postId));
    return { ok: true };
  }),

  setPinned: protectedProcedure.input(postFlagInput).mutation(async ({ ctx, input }) => {
    await requireModerator(ctx, input.postId);
    await ctx.db.update(posts).set({ pinned: input.value }).where(eq(posts.id, input.postId));
    return { ok: true };
  }),

  setLocked: protectedProcedure.input(postFlagInput).mutation(async ({ ctx, input }) => {
    await requireModerator(ctx, input.postId);
    await ctx.db.update(posts).set({ locked: input.value }).where(eq(posts.id, input.postId));
    return { ok: true };
  }),

  /** Approve or reject a post waiting in an "approval" group. */
  review: protectedProcedure.input(reviewPostInput).mutation(async ({ ctx, input }) => {
    const { post } = await requireModerator(ctx, input.postId);
    if (post.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Post isn't pending" });
    await ctx.db
      .update(posts)
      // Approved posts enter the feed as new, rather than buried at their draft time.
      .set(input.approve ? { status: "published", createdAt: new Date() } : { status: "removed" })
      .where(eq(posts.id, input.postId));
    return { ok: true };
  }),
});

async function requireModerator(ctx: { db: Parameters<typeof loadPostAccess>[0]; user: { id: string } }, postId: string) {
  const access = await loadPostAccess(ctx.db, postId, ctx.user.id);
  if (!access || !can(access.permissionContext, "post:moderate")) throw new TRPCError({ code: "FORBIDDEN" });
  return access;
}
