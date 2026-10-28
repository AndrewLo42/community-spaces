import { describeNotification, notificationHref, type EmailDigest } from "@cs/core";
import {
  and,
  asc,
  desc,
  eq,
  groups,
  gt,
  inArray,
  isNull,
  lt,
  memberships,
  ne,
  notifications,
  or,
  posts,
  sql,
  users,
  type Db,
} from "@cs/db";

const INTERVAL_MS: Record<Exclude<EmailDigest, "off">, number> = {
  // A little under a day / week, so a daily cron that runs a few minutes early still sends.
  daily: 23 * 3_600_000,
  weekly: (7 * 24 - 1) * 3_600_000,
};
const MAX_NOTIFICATIONS = 8;
const MAX_POSTS_PER_GROUP = 3;

export interface DigestUser {
  id: string;
  email: string;
  name: string;
  emailDigest: Exclude<EmailDigest, "off">;
  lastDigestAt: Date | null;
  createdAt: Date;
}

/** Users whose digest window has closed, oldest first. */
export async function dueDigestUsers(db: Db, now: Date, limit: number): Promise<DigestUser[]> {
  const dueBefore = (kind: keyof typeof INTERVAL_MS) =>
    and(
      eq(users.emailDigest, kind),
      or(isNull(users.lastDigestAt), lt(users.lastDigestAt, new Date(now.getTime() - INTERVAL_MS[kind]))),
    );

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailDigest: users.emailDigest,
      lastDigestAt: users.lastDigestAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.emailVerified, true), or(dueBefore("daily"), dueBefore("weekly"))))
    .orderBy(sql`${users.lastDigestAt} asc nulls first`)
    .limit(limit);
  return rows as DigestUser[];
}

export interface Digest {
  notifications: Array<{ text: string; href: string }>;
  moreNotifications: number;
  groups: Array<{
    name: string;
    slug: string;
    newPosts: number;
    highlights: Array<{ id: string; author: string; snippet: string }>;
  }>;
}

/** What happened since the user's last digest. Null when there's nothing worth an email. */
export async function buildDigest(db: Db, user: DigestUser, now: Date): Promise<Digest | null> {
  const fallback = new Date(now.getTime() - INTERVAL_MS[user.emailDigest]);
  const since = user.lastDigestAt ?? (user.createdAt > fallback ? user.createdAt : fallback);

  const unread = await db
    .select({
      type: notifications.type,
      actorIds: notifications.actorIds,
      actorName: users.name,
      groupName: groups.name,
      groupSlug: groups.slug,
      postId: notifications.postId,
      data: notifications.data,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .leftJoin(groups, eq(groups.id, notifications.groupId))
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .orderBy(desc(notifications.updatedAt))
    .limit(MAX_NOTIFICATIONS + 50);

  const myGroups = await db
    .select({ id: groups.id, name: groups.name, slug: groups.slug })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")));

  const newPosts = myGroups.length
    ? await db
        .select({ id: posts.id, groupId: posts.groupId, body: posts.body, author: users.name })
        .from(posts)
        .innerJoin(users, eq(users.id, posts.authorId))
        .where(
          and(
            inArray(
              posts.groupId,
              myGroups.map((g) => g.id),
            ),
            eq(posts.status, "published"),
            ne(posts.authorId, user.id),
            gt(posts.createdAt, since),
          ),
        )
        .orderBy(asc(posts.createdAt))
        .limit(500)
    : [];

  const groupsWithPosts = myGroups
    .map((g) => {
      const inGroup = newPosts.filter((p) => p.groupId === g.id);
      return {
        name: g.name,
        slug: g.slug,
        newPosts: inGroup.length,
        highlights: inGroup.slice(-MAX_POSTS_PER_GROUP).map((p) => ({
          id: p.id,
          author: p.author || "A member",
          snippet: p.body ? p.body.slice(0, 140) : "Shared a photo",
        })),
      };
    })
    .filter((g) => g.newPosts > 0)
    .sort((a, b) => b.newPosts - a.newPosts);

  if (unread.length === 0 && groupsWithPosts.length === 0) return null;

  return {
    notifications: unread.slice(0, MAX_NOTIFICATIONS).map((n) => {
      const summary = { ...n, actorCount: n.actorIds.length };
      return { text: describeNotification(summary), href: notificationHref(summary) };
    }),
    moreNotifications: Math.max(0, unread.length - MAX_NOTIFICATIONS),
    groups: groupsWithPosts,
  };
}

export async function markDigestSent(db: Db, userId: string, at: Date) {
  await db.update(users).set({ lastDigestAt: at }).where(eq(users.id, userId));
}
