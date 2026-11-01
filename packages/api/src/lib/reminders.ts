import { formatEventWhen } from "@cs/core";
import { and, asc, eq, events, groups, gt, isNull, lte, type Db } from "@cs/db";
import { audienceIds, emailRecipients } from "./announcements";
import { notify } from "./notify";

/**
 * The job runs once a day, so a 36-hour window reminds people 12 to 36 hours
 * ahead: late enough to be useful, and no event falls between two runs.
 */
const REMINDER_WINDOW_MS = 36 * 3_600_000;

/** Events starting soon whose attendees haven't been reminded yet, soonest first. */
export async function dueReminders(db: Db, now: Date, limit: number) {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        isNull(events.remindedAt),
        isNull(events.cancelledAt),
        gt(events.startsAt, now),
        lte(events.startsAt, new Date(now.getTime() + REMINDER_WINDOW_MS)),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * Marks the event reminded, notifies everyone coming in the app, and returns
 * who to email. Returns null if another run got there first, or the event was
 * cancelled since. Marking comes first: a failure partway should mean a few
 * people miss a reminder, not that everyone gets it twice on the next run.
 */
export async function sendReminder(db: Db, eventId: string, now: Date) {
  const [event] = await db
    .update(events)
    .set({ remindedAt: now })
    .where(and(eq(events.id, eventId), isNull(events.remindedAt), isNull(events.cancelledAt)))
    .returning();
  if (!event) return null;

  const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, event.groupId));
  const when = formatEventWhen(event, now);
  // Nobody is left out as the author: the organizer needs the reminder too.
  const attendees = await audienceIds(db, { eventId }, "");

  await notify(db, attendees, {
    type: "event_reminder",
    groupKey: `event_reminder:${eventId}`,
    groupId: event.groupId,
    eventId,
    actorId: null,
    data: { title: event.title, when },
  });

  return {
    eventId,
    title: event.title,
    when,
    location: event.location,
    groupId: event.groupId,
    groupName: group?.name ?? "",
    recipients: await emailRecipients(db, attendees, event.groupId),
  };
}
export type EventReminder = NonNullable<Awaited<ReturnType<typeof sendReminder>>>;
