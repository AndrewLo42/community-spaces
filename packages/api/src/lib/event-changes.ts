import { formatEventWhen } from "@cs/core";
import { and, eq, groups, isNull, notifications, sql, type Db, type events } from "@cs/db";
import { audienceIds, emailRecipients } from "./announcements";
import { notify } from "./notify";

type EventRow = typeof events.$inferSelect;

/** What changed about an event that people coming need to hear about. */
export type EventChange = { kind: "changed"; changed: "time" | "place" | "both" } | { kind: "cancelled" };

/**
 * Tells everyone going or maybe (guests included) that an event moved or was
 * called off: a notification in the app now, and the email details returned
 * for the host to send. Whoever made the change doesn't hear about it.
 */
export async function noticeEventChange(db: Db, event: EventRow, change: EventChange, actorId: string) {
  const attendees = await audienceIds(db, { eventId: event.id }, actorId);
  if (attendees.length === 0) return null;
  const [group] = await db.select({ name: groups.name, visibility: groups.visibility }).from(groups).where(eq(groups.id, event.groupId));
  const when = formatEventWhen(event);
  const type = change.kind === "cancelled" ? "event_cancelled" : "event_changed";
  // Unread notices are updated in place, so if an earlier unread one was about
  // a different change (time, then place), say both, or the first is lost.
  let changed = change.kind === "changed" ? change.changed : null;
  if (changed && changed !== "both") {
    const [earlier] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.groupKey, `event_changed:${event.id}`),
          isNull(notifications.readAt),
          sql`${notifications.data}->>'changed' <> ${changed}`,
        ),
      )
      .limit(1);
    if (earlier) changed = "both";
  }

  await notify(db, attendees, {
    type,
    // One unread notice per event: later edits update it rather than stacking up.
    groupKey: `${type}:${event.id}`,
    groupId: event.groupId,
    eventId: event.id,
    actorId,
    data: {
      title: event.title,
      when,
      place: event.location,
      ...(changed ? { changed } : {}),
    },
  });

  return {
    eventId: event.id,
    title: event.title,
    when,
    location: event.location,
    link: event.link,
    change,
    groupId: event.groupId,
    groupName: group?.name ?? "",
    groupVisibility: group?.visibility ?? "hidden",
    recipients: await emailRecipients(db, attendees, event.groupId),
  };
}
export type EventChangeEmail = NonNullable<Awaited<ReturnType<typeof noticeEventChange>>>;

/** "time", "place", "both" or nothing, comparing an event before and after an edit. */
export function whatChanged(before: EventRow, after: Pick<EventRow, "startsAt" | "endsAt" | "location" | "link">) {
  const time =
    before.startsAt.getTime() !== after.startsAt.getTime() || (before.endsAt?.getTime() ?? null) !== (after.endsAt?.getTime() ?? null);
  const place = before.location !== after.location || before.link !== after.link;
  return time && place ? "both" : time ? "time" : place ? "place" : null;
}
