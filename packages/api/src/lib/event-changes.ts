import { eventEnd, formatEventWhen } from "@cs/core";
import { and, eq, eventChangeEmails, events, groups, isNull, lt, notifications, sql, type Db } from "@cs/db";
import { audienceIds, emailRecipients } from "./announcements";
import { notify } from "./notify";

type EventRow = typeof events.$inferSelect;

/** What changed about an event that people coming need to hear about. */
export type EventChange = { kind: "changed"; changed: "time" | "place" | "both" } | { kind: "cancelled" };

type Place = Pick<EventRow, "startsAt" | "endsAt" | "location" | "link">;

/** How long a change email waits for more edits before it goes out. */
export function changeEmailDelayMs() {
  return Number(process.env.EVENT_CHANGE_EMAIL_DELAY_MS ?? 2 * 60_000);
}

/**
 * Tells everyone going or maybe (guests included) in the app, right away, that
 * an event moved or was called off. Whoever made the change doesn't hear about
 * it. Returns how many were told. Emails are separate: see holdChangeEmail.
 */
export async function noticeEventChange(db: Db, event: EventRow, change: EventChange, actorId: string) {
  const attendees = await audienceIds(db, { eventId: event.id }, actorId);
  if (attendees.length === 0) return 0;
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

  return attendees.length;
}

/** The email about a change, for everyone coming except whoever made it. */
export async function changeEmail(db: Db, event: EventRow, change: EventChange, actorId: string | null) {
  const attendees = await audienceIds(db, { eventId: event.id }, actorId ?? "");
  if (attendees.length === 0) return null;
  const [group] = await db.select({ name: groups.name, visibility: groups.visibility }).from(groups).where(eq(groups.id, event.groupId));
  return {
    eventId: event.id,
    title: event.title,
    when: formatEventWhen(event),
    location: event.location,
    link: event.link,
    change,
    groupId: event.groupId,
    groupName: group?.name ?? "",
    groupVisibility: group?.visibility ?? "hidden",
    recipients: await emailRecipients(db, attendees, event.groupId),
  };
}
export type EventChangeEmail = NonNullable<Awaited<ReturnType<typeof changeEmail>>>;

/**
 * Starts or extends the wait before a change email. The first edit saves the
 * time and place it changed from; later ones only push the send back. Returns
 * the version to hand to sendHeldChangeEmail once the wait is over.
 */
export async function holdChangeEmail(db: Db, before: EventRow, actorId: string, now = new Date()) {
  const dueAt = new Date(now.getTime() + changeEmailDelayMs());
  const [held] = await db
    .insert(eventChangeEmails)
    .values({ eventId: before.id, startsAt: before.startsAt, endsAt: before.endsAt, location: before.location, link: before.link, actorId, dueAt })
    .onConflictDoUpdate({
      target: eventChangeEmails.eventId,
      set: { actorId, dueAt, version: sql`${eventChangeEmails.version} + 1` },
    })
    .returning({ version: eventChangeEmails.version });
  return held!.version;
}

/** Forgets a waiting change email, e.g. because the event was cancelled and that email says it all. */
export async function dropHeldChangeEmail(db: Db, eventId: string) {
  await db.delete(eventChangeEmails).where(eq(eventChangeEmails.eventId, eventId));
}

/**
 * Takes a waiting change email off the list and returns it to send, comparing
 * the event now with how it was before the first edit. Nothing if a later edit
 * took over (a different version), the change was undone, or the event is
 * cancelled or over. Taking the row first means it's sent at most once.
 */
export async function sendHeldChangeEmail(db: Db, eventId: string, version?: number, now = new Date()) {
  const [held] = await db
    .delete(eventChangeEmails)
    .where(and(eq(eventChangeEmails.eventId, eventId), version === undefined ? undefined : eq(eventChangeEmails.version, version)))
    .returning();
  if (!held) return null;
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event || event.cancelledAt || eventEnd(event) <= now) return null;
  const changed = whatChanged(held, event);
  if (!changed) return null;
  return changeEmail(db, event, { kind: "changed", changed }, held.actorId);
}

/**
 * Change emails whose send was lost (the server stopped mid-wait), for the
 * daily cron to pick up. Ten minutes past due, so it never races a live wait.
 */
export async function overdueChangeEmails(db: Db, now = new Date(), limit = 50) {
  const rows = await db
    .select({ eventId: eventChangeEmails.eventId })
    .from(eventChangeEmails)
    .where(lt(eventChangeEmails.dueAt, new Date(now.getTime() - 10 * 60_000)))
    .limit(limit);
  return rows.map((r) => r.eventId);
}

/** "time", "place", "both" or nothing, comparing an event before and after an edit. */
export function whatChanged(before: Place, after: Place) {
  const time =
    before.startsAt.getTime() !== after.startsAt.getTime() || (before.endsAt?.getTime() ?? null) !== (after.endsAt?.getTime() ?? null);
  const place = before.location !== after.location || before.link !== after.link;
  return time && place ? "both" : time ? "time" : place ? "place" : null;
}
