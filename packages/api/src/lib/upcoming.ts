import { DEFAULT_EVENT_LENGTH_MS } from "@cs/core";
import { and, asc, eq, eventRsvps, events, groups, isNull, lte, memberships, sql, type Db } from "@cs/db";

/** When an event ends, for events that never said. Same default as `eventEnd`. */
export const endsAtOrDefault = sql`coalesce(${events.endsAt}, ${events.startsAt} + make_interval(secs => ${DEFAULT_EVENT_LENGTH_MS / 1000}))`;

/**
 * Events still to come across the groups someone is active in, soonest first.
 * Cancelled events are left out, and so are ones they've said they can't make.
 */
export async function upcomingEvents(db: Db, userId: string, options: { now: Date; limit: number; until?: Date }) {
  const { now, limit, until } = options;
  return db
    .select({
      id: events.id,
      title: events.title,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      timeZone: events.timeZone,
      location: events.location,
      createdAt: events.createdAt,
      createdById: events.createdById,
      groupName: groups.name,
      rsvp: eventRsvps.status,
    })
    .from(events)
    .innerJoin(groups, eq(groups.id, events.groupId))
    .innerJoin(memberships, and(eq(memberships.groupId, events.groupId), eq(memberships.userId, userId), eq(memberships.status, "active")))
    .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, userId)))
    .where(
      and(
        isNull(events.cancelledAt),
        sql`${endsAtOrDefault} > ${now.toISOString()}::timestamptz`,
        sql`${eventRsvps.status} is distinct from 'not_going'`,
        until ? lte(events.startsAt, until) : undefined,
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);
}
export type UpcomingEvent = Awaited<ReturnType<typeof upcomingEvents>>[number];
