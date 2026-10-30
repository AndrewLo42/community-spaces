import type { NotificationType } from "@cs/core";
import { and, eq, inArray, memberships, notifications, sql, type Db } from "@cs/db";

export interface NotificationEvent {
  type: NotificationType;
  /** Events with the same key coalesce into one unread notification. */
  groupKey: string;
  groupId: string;
  postId?: string;
  eventId?: string;
  actorId: string;
  data?: Record<string, string>;
}

/**
 * Records `event` for each recipient, skipping the actor. If the recipient
 * already has an unread notification with the same key, it's bumped instead.
 *
 * Notifications are a side effect: a failure here is logged, never surfaced,
 * so it can't undo the comment or approval that caused it.
 */
export async function notify(db: Db, recipientIds: string[], event: NotificationEvent): Promise<void> {
  const recipients = [...new Set(recipientIds)].filter((id) => id !== event.actorId);
  if (recipients.length === 0) return;

  try {
    await db
      .insert(notifications)
      .values(
        recipients.map((userId) => ({
          userId,
          type: event.type,
          groupKey: event.groupKey,
          groupId: event.groupId,
          postId: event.postId,
          eventId: event.eventId,
          actorId: event.actorId,
          actorIds: [event.actorId],
          data: event.data,
        })),
      )
      .onConflictDoUpdate({
        target: [notifications.userId, notifications.groupKey],
        targetWhere: sql`${notifications.readAt} is null`,
        set: {
          actorId: event.actorId,
          // Keep each person once, so "Maria and 2 others" counts people, not comments.
          actorIds: sql`case when ${event.actorId}::text = any(${notifications.actorIds}) then ${notifications.actorIds} else array_append(${notifications.actorIds}, ${event.actorId}::text) end`,
          data: event.data ?? null,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error(`notify(${event.type}) failed:`, error);
  }
}

/** Everyone who works the group's queues: moderators, admins and the owner. */
export async function moderatorIds(db: Db, groupId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.groupId, groupId),
        eq(memberships.status, "active"),
        inArray(memberships.role, ["moderator", "admin", "owner"]),
      ),
    );
  return rows.map((r) => r.userId);
}

/** "Something new to review" for a group's moderators. One coalesced row per group. */
export async function notifyModQueue(db: Db, groupId: string, actorId: string) {
  await notify(db, await moderatorIds(db, groupId), {
    type: "mod_queue",
    groupKey: `modqueue:${groupId}`,
    groupId,
    actorId,
  });
}
