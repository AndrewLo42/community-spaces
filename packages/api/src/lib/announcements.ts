import { can, canMessageAttendees, eventEnd, type AnnouncementAudience } from "@cs/core";
import { and, announcements, eq, eventRsvps, events, groups, inArray, memberships, ne, users, type Db } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { loadGroupAccess } from "./access";

export const DAY_MS = 24 * 3_600_000;

/**
 * Loads the group (and event) behind an audience, and whether this user may
 * message it: admins for a whole group, an event's organizer for its attendees.
 * Polls go to the same audiences under the same rule.
 */
export async function loadAudience(db: Db, audience: AnnouncementAudience, userId: string) {
  if ("groupId" in audience) {
    const access = await loadGroupAccess(db, { id: audience.groupId }, userId);
    if (!access) throw new TRPCError({ code: "NOT_FOUND" });
    return { ...access, event: null, allowed: can(access.permissionContext, "group:announce") };
  }
  const [event] = await db.select().from(events).where(eq(events.id, audience.eventId));
  const access = event ? await loadGroupAccess(db, { id: event.groupId }, userId) : null;
  if (!event || !access) throw new TRPCError({ code: "NOT_FOUND" });
  const ended = eventEnd(event) <= new Date();
  return { ...access, event, allowed: canMessageAttendees(access.permissionContext, { ...event, ended }) };
}

/**
 * Everyone an announcement reaches, minus its author: every active member for
 * a group announcement; active members who said going or maybe for an event.
 */
export async function audienceIds(db: Db, audience: AnnouncementAudience, authorId: string) {
  const query =
    "eventId" in audience
      ? db
          .select({ userId: eventRsvps.userId })
          .from(eventRsvps)
          .innerJoin(events, eq(events.id, eventRsvps.eventId))
          .innerJoin(
            memberships,
            and(eq(memberships.groupId, events.groupId), eq(memberships.userId, eventRsvps.userId), eq(memberships.status, "active")),
          )
          .where(and(eq(eventRsvps.eventId, audience.eventId), inArray(eventRsvps.status, ["going", "maybe"]), ne(eventRsvps.userId, authorId)))
      : db
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(and(eq(memberships.groupId, audience.groupId), eq(memberships.status, "active"), ne(memberships.userId, authorId)));
  return (await query).map((r) => r.userId);
}

/** Of these people, the ones who still want this group's announcement and reminder emails. */
export async function emailRecipients(db: Db, userIds: string[], groupId: string) {
  if (userIds.length === 0) return [];
  return db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.groupId, groupId)))
    .where(and(inArray(users.id, userIds), eq(memberships.announcementEmails, true)));
}

/** What the host needs to email an announcement: the message, where it's from, and who still wants emails. */
export async function announcementEmail(db: Db, announcementId: string) {
  const [row] = await db
    .select({ announcement: announcements, groupName: groups.name, groupSlug: groups.slug, eventTitle: events.title, authorName: users.name })
    .from(announcements)
    .innerJoin(groups, eq(groups.id, announcements.groupId))
    .leftJoin(events, eq(events.id, announcements.eventId))
    .leftJoin(users, eq(users.id, announcements.authorId))
    .where(eq(announcements.id, announcementId));
  if (!row) return null;
  const { announcement } = row;

  const ids = await audienceIds(
    db,
    announcement.eventId ? { eventId: announcement.eventId } : { groupId: announcement.groupId },
    announcement.authorId ?? "",
  );
  const recipients = await emailRecipients(db, ids, announcement.groupId);

  return {
    id: announcement.id,
    body: announcement.body,
    groupId: announcement.groupId,
    groupName: row.groupName,
    groupSlug: row.groupSlug,
    eventId: announcement.eventId,
    eventTitle: row.eventTitle,
    authorName: row.authorName,
    recipients,
  };
}
export type AnnouncementEmail = NonNullable<Awaited<ReturnType<typeof announcementEmail>>>;
