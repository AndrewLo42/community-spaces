import {
  can,
  createGroupInput,
  discoverGroupsInput,
  groupPermissions,
  joinGroupInput,
} from "@cs/core";
import { and, desc, eq, groups, ilike, memberships, ne, or, sql } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadGroupAccess } from "../lib/access";
import { notifyModQueue } from "../lib/notify";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const PAGE_SIZE = 20;

const groupCard = {
  id: groups.id,
  slug: groups.slug,
  name: groups.name,
  description: groups.description,
  category: groups.category,
  accentColor: groups.accentColor,
  visibility: groups.visibility,
  memberCount: groups.memberCount,
};

export const groupRouter = router({
  discover: publicProcedure.input(discoverGroupsInput).query(async ({ ctx, input }) => {
    const filters = [ne(groups.visibility, "hidden")];
    if (input.category) filters.push(eq(groups.category, input.category));

    const order = [desc(groups.memberCount), desc(groups.createdAt)];
    if (input.query) {
      const tsquery = sql`websearch_to_tsquery('english', ${input.query})`;
      // Full-text match, plus a substring match so partial words ("gard") still find things.
      filters.push(or(sql`${groups.searchVector} @@ ${tsquery}`, ilike(groups.name, `%${input.query}%`))!);
      order.unshift(desc(sql`ts_rank(${groups.searchVector}, ${tsquery})`));
    }

    const rows = await ctx.db
      .select(groupCard)
      .from(groups)
      .where(and(...filters))
      .orderBy(...order)
      .limit(PAGE_SIZE + 1)
      .offset(input.cursor);

    return {
      groups: rows.slice(0, PAGE_SIZE),
      nextCursor: rows.length > PAGE_SIZE ? input.cursor + PAGE_SIZE : null,
    };
  }),

  /** Groups the viewer belongs to, for the home screen. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({ ...groupCard, role: memberships.role })
      .from(memberships)
      .innerJoin(groups, eq(groups.id, memberships.groupId))
      .where(and(eq(memberships.userId, ctx.user.id), eq(memberships.status, "active")))
      .orderBy(groups.name);
  }),

  bySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const loaded = await loadGroupAccess(ctx.db, { slug: input.slug }, ctx.user?.id ?? null);
    // Hidden groups look exactly like missing ones to outsiders.
    if (!loaded || !can(loaded.permissionContext, "group:discover")) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    const { group, membership, permissionContext } = loaded;
    const { searchVector: _searchVector, ...publicGroup } = group;
    return { group: publicGroup, membership, permissions: groupPermissions(permissionContext) };
  }),

  isSlugAvailable: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const [existing] = await ctx.db.select({ id: groups.id }).from(groups).where(eq(groups.slug, input.slug));
    return !existing;
  }),

  create: protectedProcedure.input(createGroupInput).mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db.select({ id: groups.id }).from(groups).where(eq(groups.slug, input.slug));
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "That address is already taken" });

    return ctx.db.transaction(async (tx) => {
      const [group] = await tx
        .insert(groups)
        .values({ ...input, memberCount: 1, createdById: ctx.user.id })
        .returning({ id: groups.id, slug: groups.slug });
      await tx.insert(memberships).values({ groupId: group!.id, userId: ctx.user.id, role: "owner" });
      return group!;
    });
  }),

  join: protectedProcedure.input(joinGroupInput).mutation(async ({ ctx, input }) => {
    const loaded = await loadGroupAccess(ctx.db, { id: input.groupId }, ctx.user.id);
    if (!loaded || !can(loaded.permissionContext, "group:discover")) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (can(loaded.permissionContext, "group:join")) {
      await ctx.db.transaction(async (tx) => {
        await tx.insert(memberships).values({ groupId: input.groupId, userId: ctx.user.id });
        await tx
          .update(groups)
          .set({ memberCount: sql`${groups.memberCount} + 1` })
          .where(eq(groups.id, input.groupId));
      });
      return { status: "active" as const };
    }

    if (can(loaded.permissionContext, "group:requestJoin")) {
      await ctx.db.insert(memberships).values({
        groupId: input.groupId,
        userId: ctx.user.id,
        status: "pending",
        requestMessage: input.message,
      });
      await notifyModQueue(ctx.db, input.groupId, ctx.user.id);
      return { status: "pending" as const };
    }

    throw new TRPCError({ code: "FORBIDDEN", message: "This group can't be joined right now" });
  }),

  leave: protectedProcedure.input(z.object({ groupId: z.string() })).mutation(async ({ ctx, input }) => {
    const loaded = await loadGroupAccess(ctx.db, { id: input.groupId }, ctx.user.id);
    const isPendingRequest = loaded?.membership?.status === "pending";
    if (!loaded || (!can(loaded.permissionContext, "group:leave") && !isPendingRequest)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    await ctx.db.transaction(async (tx) => {
      await tx
        .delete(memberships)
        .where(and(eq(memberships.groupId, input.groupId), eq(memberships.userId, ctx.user.id)));
      if (!isPendingRequest) {
        await tx
          .update(groups)
          .set({ memberCount: sql`${groups.memberCount} - 1` })
          .where(eq(groups.id, input.groupId));
      }
    });
    return { ok: true };
  }),
});
