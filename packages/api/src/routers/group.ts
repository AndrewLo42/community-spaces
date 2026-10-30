import {
  boundingBox,
  can,
  createGroupInput,
  discoverGroupsInput,
  groupPermissions,
  joinGroupInput,
  normalizeTag,
} from "@cs/core";
import { and, asc, between, desc, eq, groups, ilike, inArray, memberships, ne, or, places, posts, sql } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadGroupAccess } from "../lib/access";
import { notifyModQueue } from "../lib/notify";
import { assertPlace, foldPlace, getPlace } from "../lib/places";
import { containsPattern, prefixPattern } from "../lib/search";
import type { Storage } from "../storage";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const PAGE_SIZE = 20;

/** Card columns; queries using it must `leftJoin(places, …)` for the location. */
const groupCard = {
  id: groups.id,
  slug: groups.slug,
  name: groups.name,
  description: groups.description,
  tags: groups.tags,
  accentColor: groups.accentColor,
  visibility: groups.visibility,
  memberCount: groups.memberCount,
  bannerKey: groups.bannerKey,
  placeId: places.id,
  placeName: places.name,
  placeState: places.state,
};

type CardRow = { bannerKey: string | null; placeId: number | null; placeName: string | null; placeState: string | null };

/** Turns stored keys and joined columns into what the UI shows: a banner URL and a place. */
function toCard<T extends CardRow>(storage: Storage, row: T) {
  const { bannerKey, ...rest } = foldPlace(row);
  return { ...rest, bannerUrl: bannerKey ? storage.publicUrl(bannerKey) : null };
}

/** Great-circle miles from a fixed point to the joined place, computed in SQL. */
function milesFrom(center: { lat: number; lng: number }) {
  return sql<number>`3958.8 * 2 * asin(sqrt(
    power(sin(radians(${places.lat} - ${center.lat}) / 2), 2) +
    cos(radians(${center.lat})) * cos(radians(${places.lat})) *
    power(sin(radians(${places.lng} - ${center.lng}) / 2), 2)
  ))`.mapWith(Number);
}

export const groupRouter = router({
  /**
   * Search and browse. With `near`, only groups within `radius` miles of that
   * town are returned, nearest first; groups without a location drop out.
   */
  discover: publicProcedure.input(discoverGroupsInput).query(async ({ ctx, input }) => {
    const filters = [ne(groups.visibility, "hidden")];
    if (input.tag) filters.push(sql`${groups.tags} @> array[${input.tag}]::text[]`);

    const order = [desc(groups.memberCount), desc(groups.createdAt)];
    if (input.query) {
      const tsquery = sql`websearch_to_tsquery('english', ${input.query})`;
      // Full-text match, plus a substring match so partial words ("gard") still find things.
      // A word that's the start of a hashtag ("garden" → #gardening) matches too.
      const asTag = normalizeTag(input.query);
      filters.push(
        or(
          sql`${groups.searchVector} @@ ${tsquery}`,
          ilike(groups.name, containsPattern(input.query)),
          asTag ? sql`exists (select 1 from unnest(${groups.tags}) as t(tag) where t.tag like ${prefixPattern(asTag)})` : undefined,
        )!,
      );
      order.unshift(desc(sql`ts_rank(${groups.searchVector}, ${tsquery})`));
    }

    let distance: ReturnType<typeof milesFrom> | null = null;
    const [center] = input.near
      ? await ctx.db.select({ lat: places.lat, lng: places.lng }).from(places).where(eq(places.id, input.near))
      : [];
    if (center) {
      distance = milesFrom(center);
      const box = boundingBox(center, input.radius);
      // The box uses the lat/lng index; the exact distance check trims its corners.
      filters.push(
        between(places.lat, box.minLat, box.maxLat),
        between(places.lng, box.minLng, box.maxLng),
        sql`${distance} <= ${input.radius}`,
      );
      order.unshift(asc(distance));
    }

    const rows = await ctx.db
      .select({ ...groupCard, distanceMiles: distance ?? sql<null>`null` })
      .from(groups)
      .leftJoin(places, eq(places.id, groups.placeId))
      .where(and(...filters))
      .orderBy(...order)
      .limit(PAGE_SIZE + 1)
      .offset(input.cursor);

    return {
      groups: rows.slice(0, PAGE_SIZE).map((g) => toCard(ctx.storage, g)),
      nextCursor: rows.length > PAGE_SIZE ? input.cursor + PAGE_SIZE : null,
    };
  }),

  /** Groups the viewer belongs to, for the home screen. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ ...groupCard, role: memberships.role })
      .from(memberships)
      .innerJoin(groups, eq(groups.id, memberships.groupId))
      .leftJoin(places, eq(places.id, groups.placeId))
      .where(and(eq(memberships.userId, ctx.user.id), eq(memberships.status, "active")))
      .orderBy(groups.name);
    return rows.map((g) => toCard(ctx.storage, g));
  }),

  /**
   * The My groups page: everything the viewer belongs to, split into groups
   * they help run and groups they're a member of (most recently active
   * first), plus requests still waiting for approval.
   */
  myGroups: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        ...groupCard,
        role: memberships.role,
        status: memberships.status,
        joinedAt: memberships.createdAt,
        lastPostAt: sql<Date | null>`(
          select max(${posts.createdAt}) from ${posts}
          where ${posts.groupId} = ${groups.id} and ${posts.status} = 'published'
        )`.mapWith(posts.createdAt),
      })
      .from(memberships)
      .innerJoin(groups, eq(groups.id, memberships.groupId))
      .leftJoin(places, eq(places.id, groups.placeId))
      .where(and(eq(memberships.userId, ctx.user.id), inArray(memberships.status, ["active", "pending"])));

    const byActivity = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
      (b.lastPostAt?.getTime() ?? 0) - (a.lastPostAt?.getTime() ?? 0) || a.name.localeCompare(b.name);
    const active = rows.filter((r) => r.status === "active").sort(byActivity);
    const view = (r: (typeof rows)[number]) => toCard(ctx.storage, r);

    return {
      managing: active.filter((r) => r.role !== "member").map(view),
      member: active.filter((r) => r.role === "member").map(view),
      pending: rows
        .filter((r) => r.status === "pending")
        .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())
        .map(view),
    };
  }),

  bySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const loaded = await loadGroupAccess(ctx.db, { slug: input.slug }, ctx.user?.id ?? null);
    // Hidden groups look exactly like missing ones to outsiders.
    if (!loaded || !can(loaded.permissionContext, "group:discover")) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    const { group, membership, permissionContext } = loaded;
    const { searchVector: _searchVector, bannerKey, ...publicGroup } = group;
    return {
      group: {
        ...publicGroup,
        bannerUrl: bannerKey ? ctx.storage.publicUrl(bannerKey) : null,
        place: await getPlace(ctx.db, group.placeId),
      },
      membership,
      permissions: groupPermissions(permissionContext),
    };
  }),

  isSlugAvailable: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const [existing] = await ctx.db.select({ id: groups.id }).from(groups).where(eq(groups.slug, input.slug));
    return !existing;
  }),

  create: protectedProcedure.input(createGroupInput).mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db.select({ id: groups.id }).from(groups).where(eq(groups.slug, input.slug));
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "That address is already taken" });
    await assertPlace(ctx.db, input.placeId);

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
