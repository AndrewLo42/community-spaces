import { can, canCommentOnPost, canViewPost, type CommentThreadRef } from "@cs/core";
import { comments, eq, events, posts, sql, type Db } from "@cs/db";
import { loadGroupAccess, loadPostAccess } from "./access";

// A comment thread hangs off a post or an event. Everything comment-related
// (listing, writing, editing, reporting, removing) goes through here, so the
// two kinds of discussion follow the same rules.

/** The thread a stored comment belongs to. */
export function threadOf(comment: { postId: string | null; eventId: string | null }): CommentThreadRef {
  return comment.postId ? { postId: comment.postId } : { eventId: comment.eventId! };
}

/** WHERE clause for the comments in a thread. */
export function inThread(ref: CommentThreadRef) {
  return "postId" in ref ? eq(comments.postId, ref.postId) : eq(comments.eventId, ref.eventId);
}

/** The thread's foreign key, for inserting a comment. */
export function threadColumns(ref: CommentThreadRef) {
  return "postId" in ref ? { postId: ref.postId } : { eventId: ref.eventId };
}

/** Keeps the denormalized comment count on the post or event in step. */
export async function bumpCommentCount(db: Pick<Db, "update">, ref: CommentThreadRef, delta: 1 | -1) {
  if ("postId" in ref) {
    await db
      .update(posts)
      .set({ commentCount: sql`${posts.commentCount} + ${delta}` })
      .where(eq(posts.id, ref.postId));
  } else {
    await db
      .update(events)
      .set({ commentCount: sql`${events.commentCount} + ${delta}` })
      .where(eq(events.id, ref.eventId));
  }
}

/**
 * Loads what comment permissions need. `parent` is what the core rules check
 * comments against: the post itself, or for an event a stand-in that behaves
 * like a published, unlocked post by the organizer. Events stay open for
 * comments after they end or are cancelled ("thanks all", "why was it off?").
 */
export async function loadThread(db: Db, ref: CommentThreadRef, userId: string | null) {
  if ("postId" in ref) {
    const access = await loadPostAccess(db, ref.postId, userId);
    if (!access) return null;
    const { post, group, permissionContext } = access;
    return {
      ref,
      group,
      permissionContext,
      parent: post,
      canView: canViewPost(permissionContext, post),
      canComment: canCommentOnPost(permissionContext, post),
      /** Who hears about new comments, and how. */
      owner: { userId: post.authorId, type: "comment" as const, groupKey: `comment:${post.id}`, data: undefined },
      notifyFields: { postId: post.id },
    };
  }

  const [event] = await db.select().from(events).where(eq(events.id, ref.eventId));
  const access = event ? await loadGroupAccess(db, { id: event.groupId }, userId) : null;
  if (!event || !access) return null;
  const { group, permissionContext } = access;
  const parent = { authorId: event.createdById ?? "", status: "published" as const, locked: false };
  return {
    ref,
    group,
    permissionContext,
    parent,
    canView: can(permissionContext, "group:read"),
    canComment: canCommentOnPost(permissionContext, parent),
    owner: event.createdById
      ? { userId: event.createdById, type: "event_comment" as const, groupKey: `event_comment:${event.id}`, data: { title: event.title } }
      : null,
    notifyFields: { eventId: event.id },
  };
}
