import { randomBytes } from "node:crypto";
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
import { and, asc, desc, eq, eventRsvps, events, inArray, memberships, sql, users, type Db } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadGroupAccess, requireGroupAction } from "../lib/access";
import { noticeEventChange, whatChanged, type EventChange } from "../lib/event-changes";
import { notify } from "../lib/notify";
import { endsAtOrDefault, upcomingEvents } from "../lib/upcoming";
import { protectedProcedure, publicProcedure, router, type Mailer } from "../trpc";

type EventRow = typeof events.$inferSelect;

/** Over = past its end time, or three hours after it started if it has none. */

/** What the UI needs for one event, including what this viewer can do with it. */
function toEventView(event: EventRow, pc: PermissionContext, rsvp: RsvpStatus | null, asGuest = false, now = new Date()) {
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
      canRsvp: Object.fromEntries(RSVP_STATUSES.map((s) => [s, canRsvp(pc, state, rsvp, s, asGuest)])) as Record<RsvpStatus, boolean>,
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

/**
 * Loads an event with its group's access context, or throws NOT_FOUND.
 *
 * Members (and anyone, for public groups) read it as usual. Someone outside a
 * private or secret group sees it as a guest if they hold the event's share
 * code or already said they're going or maybe. Banned members never do.
 * `canGuestRsvp` is whether someone who isn't a member may RSVP: guests, and
 * anyone at a public group's event.
 */
async function loadEventAccess(db: Db, eventId: string, userId: string | null, shareCode?: string) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  const access = event ? await loadGroupAccess(db, { id: event.groupId }, userId) : null;
  if (!event || !access) throw new TRPCError({ code: "NOT_FOUND" });
  const status = access.membership?.status;
  const outsider = status !== "active" && status !== "banned";
  if (can(access.permissionContext, "group:read")) {
    return { event, ...access, guest: false, canGuestRsvp: outsider && access.group.visibility === "public" };
  }
  if (status === "banned") throw new TRPCError({ code: "NOT_FOUND" });
  const shared = shareCode !== undefined && event.shareCode !== null && shareCode === event.shareCode;
  if (!shared && !(userId && (await isComing(db, event.id, userId)))) throw new TRPCError({ code: "NOT_FOUND" });
  return { event, ...access, guest: true, canGuestRsvp: true };
}

async function isComing(db: Db, eventId: string, userId: string) {
  const [row] = await db
    .select({ status: eventRsvps.status })
    .from(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId), inArray(eventRsvps.status, ["going", "maybe"])));
  return row !== undefined;
}

/** Who may turn link sharing on: whoever manages the event, in groups that aren't already public. */
function canShareEvent(pc: PermissionContext, event: EventRow) {
  return pc.group.visibility !== "public" && canManageEvent(pc, event);
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
  byId: publicProcedure.input(z.object({ eventId: z.string(), share: z.string().max(64).optional() })).query(async ({ ctx, input }) => {
    const userId = ctx.user?.id ?? null;
    const { event, group, permissionContext, guest, canGuestRsvp } = await loadEventAccess(ctx.db, input.eventId, userId, input.share);
    // A guest of a secret group learns about this event, not who's in the group.
    const secretGuest = guest && group.visibility === "hidden";

    const [organizer] = event.createdById && !secretGuest
      ? await ctx.db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(eq(users.id, event.createdById))
      : [];
    const rsvp = (await viewerRsvps(ctx.db, [event.id], userId)).get(event.id) ?? null;
    // Event links get shared beyond the group, so who's coming is for members
    // and fellow attendees; everyone else sees only the counts.
    const attendeesVisible = !guest && (permissionContext.membership?.status === "active" || rsvp === "going" || rsvp === "maybe");
    const view = toEventView(event, permissionContext, rsvp, canGuestRsvp);
    const coming = rsvp === "going" || rsvp === "maybe";
    // Guests who said they're coming get the address even when the shared page hides it.
    const locationHidden = guest && !coming && !event.shareLocation && (event.location !== "" || event.link !== "");
    const attendees = attendeesVisible
      ? await ctx.db
          .select({ id: users.id, name: users.name, image: users.image, status: eventRsvps.status, memberStatus: memberships.status })
          .from(eventRsvps)
          .innerJoin(users, eq(users.id, eventRsvps.userId))
          .leftJoin(memberships, and(eq(memberships.groupId, event.groupId), eq(memberships.userId, eventRsvps.userId)))
          .where(and(eq(eventRsvps.eventId, event.id), inArray(eventRsvps.status, ["going", "maybe"])))
          .orderBy(asc(eventRsvps.createdAt))
          .limit(500)
      : [];
    /** Attendees who aren't members are labeled guests for the people who can see the list. */
    const people = attendees.map(({ memberStatus, ...a }) => ({ ...a, guest: memberStatus !== "active" }));

    return {
      ...view,
      ...(locationHidden ? { location: "", link: "" } : {}),
      group: secretGuest
        ? { id: group.id, slug: null, name: "A private group", accentColor: group.accentColor, visibility: group.visibility }
        : { id: group.id, slug: group.slug as string | null, name: group.name, accentColor: group.accentColor, visibility: group.visibility },
      guest,
      locationHidden,
      /** Present when the event can be shared beyond the group; members and guests holding it get the code. */
      sharing:
        group.visibility === "public"
          ? null
          : {
              code: event.shareCode,
              showLocation: event.shareLocation,
              canChange: !guest && canShareEvent(permissionContext, event),
            },
      organizer: organizer ?? null,
      attendeesVisible,
      going: people.filter((a) => a.status === "going"),
      maybe: people.filter((a) => a.status === "maybe"),
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
    const [updated] = await ctx.db
      .update(events)
      .set({ ...fields, ...(moved ? { remindedAt: null } : {}) })
      .where(eq(events.id, eventId))
      .returning();
    // A new time or place is news for everyone coming; a reworded description isn't.
    const changed = whatChanged(event, updated!);
    if (changed && eventEnd(updated!) > new Date()) {
      await tellAttendees(ctx, updated!, { kind: "changed", changed });
    }
    return { id: eventId };
  }),

  /** Cancelled events stay on the calendar, marked, so people who planned to come find out. */
  cancel: protectedProcedure.input(z.object({ eventId: z.string() })).mutation(async ({ ctx, input }) => {
    const { event, permissionContext } = await loadEventAccess(ctx.db, input.eventId, ctx.user.id);
    if (!canManageEvent(permissionContext, event)) throw new TRPCError({ code: "FORBIDDEN" });
    if (!event.cancelledAt) {
      const [cancelled] = await ctx.db.update(events).set({ cancelledAt: new Date() }).where(eq(events.id, event.id)).returning();
      if (eventEnd(cancelled!) > new Date()) await tellAttendees(ctx, cancelled!, { kind: "cancelled" });
    }
    return { id: event.id };
  }),

  /**
   * Turns the outside-the-group link on or off. Turning it off forgets the
   * code, so links already sent stop working; turning it on again makes a new one.
   */
  setSharing: protectedProcedure
    .input(z.object({ eventId: z.string(), enabled: z.boolean(), showLocation: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { event, permissionContext } = await loadEventAccess(ctx.db, input.eventId, ctx.user.id);
      if (!canShareEvent(permissionContext, event)) throw new TRPCError({ code: "FORBIDDEN" });
      const shareCode = input.enabled ? (event.shareCode ?? randomBytes(9).toString("base64url")) : null;
      await ctx.db.update(events).set({ shareCode, shareLocation: input.showLocation }).where(eq(events.id, event.id));
      return { code: shareCode };
    }),

  rsvp: protectedProcedure.input(rsvpInput).mutation(async ({ ctx, input }) => {
    const access = await loadEventAccess(ctx.db, input.eventId, ctx.user.id, input.share);

    const result = await ctx.db.transaction(async (tx) => {
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
      if (!canRsvp(access.permissionContext, state, before, input.status, access.canGuestRsvp)) {
        const full =
          input.status === "going" && !state.cancelled && !state.ended && (access.membership?.status === "active" || access.canGuestRsvp);
        throw new TRPCError({
          code: full ? "CONFLICT" : "FORBIDDEN",
          message: full ? "This event is full" : state.cancelled ? "This event was cancelled" : state.ended ? "This event is over" : "Join the group to RSVP",
        });
      }
      if (before === input.status) return { status: before, before };

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
      return { status: input.status, before };
    });

    // The organizer hears when someone new is coming (one notice per event, gathering names while unread).
    const joining =
      result.status !== result.before &&
      (result.status === "going" || (result.status === "maybe" && result.before !== "going"));
    if (joining && access.event.createdById) {
      await notify(ctx.db, [access.event.createdById], {
        type: "event_rsvp",
        groupKey: `event_rsvp:${access.event.id}`,
        groupId: access.event.groupId,
        eventId: access.event.id,
        actorId: ctx.user.id,
        data: { title: access.event.title },
      });
    }
    return { status: result.status };
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

/** In-app notices now; emails after the response, like announcements. */
async function tellAttendees(ctx: { db: Db; mailer?: Mailer; after?: (task: () => Promise<void>) => void; user: { id: string } }, event: EventRow, change: EventChange) {
  const email = await noticeEventChange(ctx.db, event, change, ctx.user.id);
  const { mailer } = ctx;
  if (!email || !mailer || email.recipients.length === 0) return;
  const send = () => mailer.sendEventChange(email).catch((e) => console.error(`event ${event.id} change email failed:`, e));
  if (ctx.after) ctx.after(send);
  else void send();
}
