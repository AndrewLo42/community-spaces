import type { PermissionContext } from "@cs/core";
import { and, eq, groups, memberships, posts, type Db } from "@cs/db";

/** Loads a group plus the viewer's membership, ready for `can()`. */
export async function loadGroupAccess(db: Db, where: { id: string } | { slug: string }, userId: string | null) {
  const [group] = await db
    .select()
    .from(groups)
    .where("id" in where ? eq(groups.id, where.id) : eq(groups.slug, where.slug));
  if (!group) return null;

  const [membership] = userId
    ? await db
        .select({ role: memberships.role, status: memberships.status })
        .from(memberships)
        .where(and(eq(memberships.groupId, group.id), eq(memberships.userId, userId)))
    : [];

  const permissionContext: PermissionContext = { userId, group, membership: membership ?? null };
  return { group, membership: membership ?? null, permissionContext };
}

/** Loads a post along with its group's access context. */
export async function loadPostAccess(db: Db, postId: string, userId: string | null) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) return null;
  const access = await loadGroupAccess(db, { id: post.groupId }, userId);
  return access ? { post, ...access } : null;
}
