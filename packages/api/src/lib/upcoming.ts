import { DEFAULT_EVENT_LENGTH_MS } from "@cs/core";
import { and, asc, eq, eventRsvps, events, groups, inArray, isNull, lte, memberships, ne, or, sql, type Db } from "@cs/db";

/** When an event ends, for events that never said. Same default as `eventEnd`. */
export const endsAtOrDefault = sql`coalesce(${events.endsAt}, ${events.startsAt} + make_interval(secs => ${DEFAULT_EVENT_LENGTH_MS / 1000}))`;

/**
 * Events still to come across the groups someone is active in, plus ones
 * elsewhere they said they're going or maybe to as a guest, soonest first.
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
      groupName: sql<string>`case when ${groups.visibility} = 'hidden' and ${memberships.status} is distinct from 'active' then 'A private group' else ${groups.name} end`,
      rsvp: eventRsvps.status,
    })
    .from(events)
    .innerJoin(groups, eq(groups.id, events.groupId))
    .leftJoin(memberships, and(eq(memberships.groupId, events.groupId), eq(memberships.userId, userId)))
    .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, userId)))
    .where(
      and(
        or(
          eq(memberships.status, "active"),
          and(inArray(eventRsvps.status, ["going", "maybe"]), or(isNull(memberships.status), ne(memberships.status, "banned"))),
        ),
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
