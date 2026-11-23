import {
  markReadInput,
  markSeenInput,
  notificationListInput,
  notificationSettingInput,
  updatePreferencesInput,
  type NotificationFilter,
  type NotificationType,
} from "@cs/core";
import { and, count, desc, eq, events, groups, inArray, isNotNull, isNull, lt, memberships, notifications, notInArray, posts, sql, users } from "@cs/db";
import { protectedProcedure, router } from "../trpc";

const PAGE_SIZE = 30;

const unreadOf = (userId: string) => and(eq(notifications.userId, userId), isNull(notifications.readAt));

const POST_TYPES: NotificationType[] = ["comment", "reply", "post_approved", "post_declined"];

/**
 * The notifications page's tabs. Events: anything about an event. Posts: your
 * posts and comments. Groups: the rest (memberships, roles, review queues, and
 * group-wide announcements and polls).
 */
function filterWhere(filter: NotificationFilter) {
  switch (filter) {
    case "all":
      return undefined;
    case "unread":
      return isNull(notifications.readAt);
    case "events":
      return isNotNull(notifications.eventId);
    case "posts":
      return and(isNull(notifications.eventId), inArray(notifications.type, POST_TYPES));
    case "groups":
      return and(isNull(notifications.eventId), notInArray(notifications.type, POST_TYPES));
  }
}

export const notificationRouter = router({
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db.select({ n: count() }).from(notifications).where(unreadOf(ctx.user.id));
    return row?.n ?? 0;
  }),

  /** Newest activity first. Cursor is the last row's updatedAt. */
  list: protectedProcedure.input(notificationListInput).query(async ({ ctx, input }) => {
    const before = input.cursor ? new Date(input.cursor) : null;
    const rows = await ctx.db
      .select({
        id: notifications.id,
        type: notifications.type,
        readAt: notifications.readAt,
        updatedAt: notifications.updatedAt,
        actorIds: notifications.actorIds,
        actorName: users.name,
        data: notifications.data,
        postId: notifications.postId,
        postBody: posts.body,
        eventId: notifications.eventId,
        eventTitle: events.title,
        groupSlug: groups.slug,
        groupName: groups.name,
        groupAccent: groups.accentColor,
        groupVisibility: groups.visibility,
        memberStatus: memberships.status,
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .leftJoin(posts, eq(posts.id, notifications.postId))
      .leftJoin(events, eq(events.id, notifications.eventId))
      .leftJoin(groups, eq(groups.id, notifications.groupId))
      .leftJoin(memberships, and(eq(memberships.groupId, notifications.groupId), eq(memberships.userId, ctx.user.id)))
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          filterWhere(input.filter),
          before && !Number.isNaN(before.getTime()) ? lt(notifications.updatedAt, before) : undefined,
        ),
      )
      .orderBy(desc(notifications.updatedAt))
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE).map(({ actorIds, groupVisibility, memberStatus, ...n }) => {
      // Guests of a secret group's event hear about the event, not the group or who's in it.
      const secretGuest = groupVisibility === "hidden" && memberStatus !== "active";
      return {
        ...n,
        ...(secretGuest ? { groupName: "A private group", groupSlug: null, actorName: null } : {}),
        actorCount: actorIds.length,
        postSnippet: n.postBody ? n.postBody.slice(0, 120) : n.eventTitle,
      };
    });
    const last = page[page.length - 1];
    return { notifications: page, nextCursor: rows.length > PAGE_SIZE && last ? last.updatedAt.toISOString() : null };
  }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.update(notifications).set({ readAt: new Date() }).where(unreadOf(ctx.user.id));
    return { ok: true };
  }),

  /** Opening a post, an event or the manage page clears the notifications about it. */
  markSeen: protectedProcedure.input(markSeenInput).mutation(async ({ ctx, input }) => {
    const target =
      "postId" in input
        ? eq(notifications.postId, input.postId)
        : "eventId" in input
          ? eq(notifications.eventId, input.eventId)
          : and(eq(notifications.type, "mod_queue"), eq(notifications.groupId, input.modQueueGroupId));
    const updated = await ctx.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(unreadOf(ctx.user.id), target))
      .returning({ id: notifications.id });
    return { updated: updated.length };
  }),

  markRead: protectedProcedure.input(markReadInput).mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(unreadOf(ctx.user.id), inArray(notifications.id, input.ids)));
    return { ok: true };
  }),

  preferences: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ emailDigest: users.emailDigest, muted: users.mutedNotifications })
      .from(users)
      .where(eq(users.id, ctx.user.id));
    return { emailDigest: row?.emailDigest ?? "off", mutedNotifications: row?.muted ?? [] };
  }),

  /** Turns one kind of in-app notification on or off. */
  setNotificationSetting: protectedProcedure.input(notificationSettingInput).mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(users)
      .set({
        mutedNotifications: input.enabled
          ? sql`array_remove(${users.mutedNotifications}, ${input.setting})`
          : sql`case when ${input.setting} = any(${users.mutedNotifications}) then ${users.mutedNotifications} else array_append(${users.mutedNotifications}, ${input.setting}) end`,
      })
      .where(eq(users.id, ctx.user.id));
    return { ok: true };
  }),

  updatePreferences: protectedProcedure.input(updatePreferencesInput).mutation(async ({ ctx, input }) => {
    await ctx.db.update(users).set({ emailDigest: input.emailDigest }).where(eq(users.id, ctx.user.id));
    return { ok: true };
  }),
});
