import {
  can,
  canCommentOnPost,
  canManageEvent,
  canMessageAttendees,
  canRsvp,
  createEventInput,
  DEFAULT_EVENT_LENGTH_MS,
  eventEnd,
  listEventsInput,
  RSVP_STATUSES,
  rsvpInput,
  updateEventInput,
  type PermissionContext,
  type RsvpStatus,
} from "@cs/core";
import { and, asc, desc, eq, eventRsvps, events, inArray, sql, users, type Db } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadGroupAccess, requireGroupAction } from "../lib/access";
import { endsAtOrDefault, upcomingEvents } from "../lib/upcoming";
import { protectedProcedure, publicProcedure, router } from "../trpc";

type EventRow = typeof events.$inferSelect;

/** Over = past its end time, or three hours after it started if it has none. */

/** What the UI needs for one event, including what this viewer can do with it. */
function toEventView(event: EventRow, pc: PermissionContext, rsvp: RsvpStatus | null, now = new Date()) {
  const ended = eventEnd(event) <= now;
  const cancelled = event.cancelledAt !== null;
  const state = { cancelled, ended, capacity: event.capacity, goingCount: event.goingCount };
  return {
    id: event.id,
    groupId: event.groupId,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timeZone: event.timeZone,
    location: event.location,
    link: event.link,
    capacity: event.capacity,
    goingCount: event.goingCount,
    maybeCount: event.maybeCount,
    commentCount: event.commentCount,
    spotsLeft: event.capacity === null ? null : Math.max(0, event.capacity - event.goingCount),
    cancelled,
    ended,
    viewer: {
      rsvp,
      canManage: !cancelled && canManageEvent(pc, event),
      canMessage: canMessageAttendees(pc, { ...event, ended }),
      // Same rule as the thread loader in lib/threads: an event discussion is an open, published thread.
      canComment: canCommentOnPost(pc, { locked: false }),
      /** Which RSVP buttons work right now. */
      canRsvp: Object.fromEntries(RSVP_STATUSES.map((s) => [s, canRsvp(pc, state, rsvp, s)])) as Record<RsvpStatus, boolean>,
    },
  };
}
export type EventView = ReturnType<typeof toEventView>;

async function viewerRsvps(db: Db, eventIds: string[], userId: string | null) {
  if (!userId || eventIds.length === 0) return new Map<string, RsvpStatus>();
  const rows = await db
    .select({ eventId: eventRsvps.eventId, status: eventRsvps.status })
    .from(eventRsvps)
    .where(and(eq(eventRsvps.userId, userId), inArray(eventRsvps.eventId, eventIds)));
  return new Map(rows.map((r) => [r.eventId, r.status]));
}

/** Loads an event with its group's access context, or throws NOT_FOUND if the viewer can't read the group. */
async function loadEventAccess(db: Db, eventId: string, userId: string | null) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  const access = event ? await loadGroupAccess(db, { id: event.groupId }, userId) : null;
  if (!event || !access || !can(access.permissionContext, "group:read")) throw new TRPCError({ code: "NOT_FOUND" });
  return { event, ...access };
}

export const eventRouter = router({
  /** A group's calendar: upcoming soonest first, past most recent first. Cancelled events stay listed, marked. */
  list: publicProcedure.input(listEventsInput).query(async ({ ctx, input }) => {
    const userId = ctx.user?.id ?? null;
    const access = await loadGroupAccess(ctx.db, { id: input.groupId }, userId);
    if (!access || !can(access.permissionContext, "group:read")) throw new TRPCError({ code: "FORBIDDEN" });

    const upcoming = input.when === "upcoming";
    const rows = await ctx.db
      .select()
      .from(events)
      .where(and(eq(events.groupId, input.groupId), upcoming ? sql`${endsAtOrDefault} > now()` : sql`${endsAtOrDefault} <= now()`))
      .orderBy(upcoming ? asc(events.startsAt) : desc(events.startsAt), asc(events.id))
      .limit(input.limit + 1)
      .offset(input.cursor);

    const page = rows.slice(0, input.limit);
    const rsvps = await viewerRsvps(ctx.db, page.map((e) => e.id), userId);
    return {
      events: page.map((e) => toEventView(e, access.permissionContext, rsvps.get(e.id) ?? null)),
      nextCursor: rows.length > input.limit ? input.cursor + input.limit : null,
    };
  }),

  /** One event with its group, organizer and who's coming. */
  byId: publicProcedure.input(z.object({ eventId: z.string() })).query(async ({ ctx, input }) => {
    const userId = ctx.user?.id ?? null;
    const { event, group, permissionContext } = await loadEventAccess(ctx.db, input.eventId, userId);

    const [organizer] = event.createdById
      ? await ctx.db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(eq(users.id, event.createdById))
      : [];
    const attendees = await ctx.db
      .select({ id: users.id, name: users.name, image: users.image, status: eventRsvps.status })
      .from(eventRsvps)
      .innerJoin(users, eq(users.id, eventRsvps.userId))
      .where(and(eq(eventRsvps.eventId, event.id), inArray(eventRsvps.status, ["going", "maybe"])))
      .orderBy(asc(eventRsvps.createdAt))
      .limit(500);
    const rsvp = (await viewerRsvps(ctx.db, [event.id], userId)).get(event.id) ?? null;

    return {
      ...toEventView(event, permissionContext, rsvp),
      group: { id: group.id, slug: group.slug, name: group.name, accentColor: group.accentColor },
      organizer: organizer ?? null,
      going: attendees.filter((a) => a.status === "going"),
      maybe: attendees.filter((a) => a.status === "maybe"),
    };
  }),

  /** The organizer is marked as going. */
  create: protectedProcedure.input(createEventInput).mutation(async ({ ctx, input }) => {
    const { groupId, ...fields } = input;
    await requireGroupAction(ctx.db, groupId, ctx.user.id, "event:create");
    if (fields.startsAt <= new Date()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a time that hasn't happened yet" });
    }

    return ctx.db.transaction(async (tx) => {
      const [event] = await tx
        .insert(events)
        .values({ ...fields, groupId, createdById: ctx.user.id, goingCount: 1 })
        .returning({ id: events.id });
      await tx.insert(eventRsvps).values({ eventId: event!.id, userId: ctx.user.id, status: "going" });
      return event!;
    });
  }),

  update: protectedProcedure.input(updateEventInput).mutation(async ({ ctx, input }) => {
    const { eventId, ...fields } = input;
    const { event, permissionContext } = await loadEventAccess(ctx.db, eventId, ctx.user.id);
    if (!canManageEvent(permissionContext, event) || event.cancelledAt) throw new TRPCError({ code: "FORBIDDEN" });
    // Fixing a typo in a past event is fine; moving an event into the past isn't.
    if (fields.startsAt.getTime() !== event.startsAt.getTime() && fields.startsAt <= new Date()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a time that hasn't happened yet" });
    }
    // Lowering capacity never bumps anyone; it only stops new "going" answers.
    const moved = fields.startsAt.getTime() !== event.startsAt.getTime();
    await ctx.db
      .update(events)
      .set({ ...fields, ...(moved ? { remindedAt: null } : {}) })
      .where(eq(events.id, eventId));
    return { id: eventId };
  }),

  /** Cancelled events stay on the calendar, marked, so people who planned to come find out. */
  cancel: protectedProcedure.input(z.object({ eventId: z.string() })).mutation(async ({ ctx, input }) => {
    const { event, permissionContext } = await loadEventAccess(ctx.db, input.eventId, ctx.user.id);
    if (!canManageEvent(permissionContext, event)) throw new TRPCError({ code: "FORBIDDEN" });
    if (!event.cancelledAt) await ctx.db.update(events).set({ cancelledAt: new Date() }).where(eq(events.id, event.id));
    return { id: event.id };
  }),

  rsvp: protectedProcedure.input(rsvpInput).mutation(async ({ ctx, input }) => {
    const access = await loadEventAccess(ctx.db, input.eventId, ctx.user.id);

    return ctx.db.transaction(async (tx) => {
      // Lock the event so two people can't take the last spot at once.
      const [event] = await tx.select().from(events).where(eq(events.id, input.eventId)).for("update");
      const [current] = await tx
        .select({ status: eventRsvps.status })
        .from(eventRsvps)
        .where(and(eq(eventRsvps.eventId, input.eventId), eq(eventRsvps.userId, ctx.user.id)));
      const before = current?.status ?? null;
      const state = {
        cancelled: event!.cancelledAt !== null,
        ended: eventEnd(event!) <= new Date(),
        capacity: event!.capacity,
        goingCount: event!.goingCount,
      };
      if (!canRsvp(access.permissionContext, state, before, input.status)) {
        const full = input.status === "going" && !state.cancelled && !state.ended && access.membership?.status === "active";
        throw new TRPCError({
          code: full ? "CONFLICT" : "FORBIDDEN",
          message: full ? "This event is full" : state.cancelled ? "This event was cancelled" : state.ended ? "This event is over" : "Join the group to RSVP",
        });
      }
      if (before === input.status) return { status: before };

      await tx
        .insert(eventRsvps)
        .values({ eventId: input.eventId, userId: ctx.user.id, status: input.status })
        .onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.userId], set: { status: input.status, updatedAt: new Date() } });
      const delta = (s: RsvpStatus) => (input.status === s ? 1 : 0) - (before === s ? 1 : 0);
      await tx
        .update(events)
        .set({
          goingCount: sql`${events.goingCount} + ${delta("going")}`,
          maybeCount: sql`${events.maybeCount} + ${delta("maybe")}`,
        })
        .where(eq(events.id, input.eventId));
      return { status: input.status };
    });
  }),

  /** The next few events in a group, for the sidebar on its posts tab. */
  nextUp: publicProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    const access = await loadGroupAccess(ctx.db, { id: input.groupId }, ctx.user?.id ?? null);
    if (!access || !can(access.permissionContext, "group:read")) return [];
    const rows = await ctx.db
      .select({ id: events.id, title: events.title, startsAt: events.startsAt, endsAt: events.endsAt, timeZone: events.timeZone })
      .from(events)
      .where(and(eq(events.groupId, input.groupId), sql`${events.cancelledAt} is null`, sql`${endsAtOrDefault} > now()`))
      .orderBy(asc(events.startsAt))
      .limit(3);
    return rows;
  }),

  /** What's coming up across the viewer's groups, for the home page. */
  upcoming: protectedProcedure.query(({ ctx }) => upcomingEvents(ctx.db, ctx.user.id, { now: new Date(), limit: 5 })),
});
