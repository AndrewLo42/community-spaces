import {
  MEMBER_ROLES,
  type CommentPolicy,
  type EventPolicy,
  type GroupVisibility,
  type InvitePolicy,
  type JoinPolicy,
  type MemberRole,
  type MembershipStatus,
  type PostPolicy,
  type PostStatus,
  type RsvpStatus,
} from "./constants";

// Every permission decision in the app goes through this file, so the rules
// live in one place and are covered by permissions.test.ts. The API layer
// loads the group + the viewer's membership and asks `can()`.

export interface GroupRules {
  visibility: GroupVisibility;
  joinPolicy: JoinPolicy;
  postPolicy: PostPolicy;
  commentPolicy: CommentPolicy;
  eventPolicy: EventPolicy;
  invitePolicy: InvitePolicy;
}

export interface MembershipState {
  role: MemberRole;
  status: MembershipStatus;
}

export interface PermissionContext {
  /** null when signed out */
  userId: string | null;
  group: GroupRules;
  /** null when the viewer has no membership row (never joined or requested) */
  membership: MembershipState | null;
}

export type GroupAction =
  | "group:discover" // appears in search / can see the group page at all
  | "group:read" // can read posts and comments
  | "group:join" // can join instantly
  | "group:requestJoin" // can ask to join
  | "group:leave"
  | "group:editSettings"
  | "group:delete"
  | "post:create"
  | "post:publishWithoutApproval"
  | "post:moderate" // pin, lock, remove, approve
  | "comment:create"
  | "event:create"
  | "member:review" // approve / reject join requests
  | "member:ban"
  | "report:review"
  | "invite:create" // make an invite link of your own
  | "invite:manage" // see and revoke every link
  | "group:announce" // message every member at once
  | "group:manage"; // can open the manage page at all

export function roleRank(role: MemberRole): number {
  return MEMBER_ROLES.indexOf(role);
}

export function isAtLeast(role: MemberRole | undefined, min: MemberRole): boolean {
  return role !== undefined && roleRank(role) >= roleRank(min);
}

function activeRole(ctx: PermissionContext): MemberRole | undefined {
  return ctx.membership?.status === "active" ? ctx.membership.role : undefined;
}

export function can(ctx: PermissionContext, action: GroupAction): boolean {
  const role = activeRole(ctx);
  const isMember = role !== undefined;
  const { group } = ctx;

  switch (action) {
    case "group:discover":
      return group.visibility !== "hidden" || isMember;

    case "group:read":
      return group.visibility === "public" || isMember;

    case "group:join":
      return ctx.userId !== null && ctx.membership === null && group.joinPolicy === "open";

    case "group:requestJoin":
      return ctx.userId !== null && ctx.membership === null && group.joinPolicy === "request";

    case "group:leave":
      // The owner must transfer ownership before leaving.
      return isMember && role !== "owner";

    case "group:editSettings":
      return isAtLeast(role, "admin");

    case "group:delete":
      return role === "owner";

    case "post:create":
      if (!isMember) return false;
      return group.postPolicy === "admins" ? isAtLeast(role, "admin") : true;

    case "post:publishWithoutApproval":
      if (!can(ctx, "post:create")) return false;
      return group.postPolicy !== "approval" || isAtLeast(role, "moderator");

    case "comment:create":
      if (!isMember) return false;
      return group.commentPolicy === "admins" ? isAtLeast(role, "admin") : true;

    case "event:create":
      if (!isMember) return false;
      return group.eventPolicy === "admins" ? isAtLeast(role, "admin") : true;

    case "post:moderate":
    case "member:review":
    case "member:ban":
    case "report:review":
    case "group:manage":
      return isAtLeast(role, "moderator");

    case "invite:create":
      return group.invitePolicy === "members" ? isMember : isAtLeast(role, "admin");

    case "invite:manage":
    case "group:announce":
      return isAtLeast(role, "admin");
  }
}

/**
 * Removing or banning a member: moderators and up, only for people they
 * outrank, never themselves. So moderators handle members, admins handle
 * moderators, and the owner can't be removed.
 */
export function canModerateMember(ctx: PermissionContext, target: { userId: string; role: MemberRole }): boolean {
  const role = activeRole(ctx);
  if (!role || !isAtLeast(role, "moderator")) return false;
  if (ctx.userId === target.userId) return false;
  return roleRank(role) > roleRank(target.role);
}

/** Any signed-in reader can report someone else's content. */
export function canReport(ctx: PermissionContext, content: { authorId: string }): boolean {
  return ctx.userId !== null && ctx.userId !== content.authorId && can(ctx, "group:read");
}

/**
 * An invite link works whatever the join policy, including for someone with a
 * pending request. It never lets a banned user back in.
 */
export function canAcceptInvite(ctx: PermissionContext): boolean {
  if (ctx.userId === null) return false;
  return ctx.membership === null || ctx.membership.status === "pending";
}

/**
 * Published posts follow the group's read rule. Pending posts are visible only
 * to their author and moderators; removed posts to nobody.
 */
export function canViewPost(ctx: PermissionContext, post: { authorId: string; status: PostStatus }): boolean {
  if (!can(ctx, "group:read")) return false;
  if (post.status === "published") return true;
  if (post.status === "pending") return ctx.userId === post.authorId || can(ctx, "post:moderate");
  return false;
}

/** Comments go on published posts; locked posts only take moderator comments. */
export function canCommentOnPost(ctx: PermissionContext, post: { locked: boolean; status?: PostStatus }): boolean {
  if (post.status !== undefined && post.status !== "published") return false;
  if (!can(ctx, "comment:create")) return false;
  return !post.locked || isAtLeast(activeRole(ctx), "moderator");
}

/** Only the author edits their own words; moderators remove, they don't rewrite. */
export function canEditContent(ctx: PermissionContext, content: { authorId: string }): boolean {
  return ctx.userId !== null && ctx.userId === content.authorId;
}

export function canRemoveContent(ctx: PermissionContext, content: { authorId: string }): boolean {
  return canEditContent(ctx, content) || can(ctx, "post:moderate");
}

/** Authors can fix their post while they can still see it, unless it was removed. */
export function canEditPost(ctx: PermissionContext, post: { authorId: string; status: PostStatus }): boolean {
  return canEditContent(ctx, post) && post.status !== "removed" && canViewPost(ctx, post);
}

/**
 * Same for comments, plus: a locked post's discussion is closed, so only
 * moderators can still change what's there.
 */
export function canEditComment(
  ctx: PermissionContext,
  comment: { authorId: string; status: "visible" | "removed" },
  post: { authorId: string; status: PostStatus; locked: boolean },
): boolean {
  if (!canEditContent(ctx, comment) || comment.status === "removed" || !canViewPost(ctx, post)) return false;
  return !post.locked || isAtLeast(activeRole(ctx), "moderator");
}

/**
 * Whoever planned an event can change or cancel it, and so can moderators and
 * up, so a meetup doesn't get stuck when its organizer goes quiet.
 */
export function canManageEvent(ctx: PermissionContext, event: { createdById: string | null }): boolean {
  const role = activeRole(ctx);
  if (!role) return false;
  return (event.createdById !== null && event.createdById === ctx.userId) || isAtLeast(role, "moderator");
}

/**
 * Whoever manages an event can message the people coming, until it's over.
 * That includes after cancelling it, which is when attendees most need to hear.
 */
export function canMessageAttendees(ctx: PermissionContext, event: { createdById: string | null; ended: boolean }): boolean {
  return !event.ended && canManageEvent(ctx, event);
}

/**
 * Group polls are for every active member; an event's polls are for the
 * people coming (and whoever runs it), the same people its updates reach.
 */
export function canVote(
  ctx: PermissionContext,
  poll: { closed: boolean; forEvent: boolean },
  viewer: { attending: boolean; managesEvent: boolean },
): boolean {
  if (!activeRole(ctx) || poll.closed) return false;
  return !poll.forEvent || viewer.attending || viewer.managesEvent;
}

/** Whoever asked can close or delete a poll, and so can moderators and up. */
export function canManagePoll(ctx: PermissionContext, poll: { authorId: string | null }): boolean {
  const role = activeRole(ctx);
  if (!role) return false;
  return (poll.authorId !== null && poll.authorId === ctx.userId) || isAtLeast(role, "moderator");
}

/** A poll is closed once someone closes it or its end time passes. */
export function pollClosed(poll: { closedAt: Date | null; closesAt: Date | null }, now = new Date()): boolean {
  return poll.closedAt !== null || (poll.closesAt !== null && poll.closesAt <= now);
}

/**
 * Members answer until the event is over. "Going" needs a free spot unless
 * you already have one; "maybe" and "can't go" never take a spot.
 */
export function canRsvp(
  ctx: PermissionContext,
  event: { cancelled: boolean; ended: boolean; capacity: number | null; goingCount: number },
  current: RsvpStatus | null,
  next: RsvpStatus,
): boolean {
  if (!activeRole(ctx) || event.cancelled || event.ended) return false;
  if (next !== "going" || current === "going" || event.capacity === null) return true;
  return event.goingCount < event.capacity;
}

/** Only the owner hands the group over, and only to another active member. */
export function canTransferOwnership(ctx: PermissionContext, target: { userId: string; status: MembershipStatus }): boolean {
  return activeRole(ctx) === "owner" && target.userId !== ctx.userId && target.status === "active";
}

/**
 * The actor must outrank both the target's current role and the role being
 * assigned. So the owner can promote to admin, admins can manage moderators
 * and members, and nobody can change the owner's role (ownership transfer is
 * a separate flow).
 */
export function canChangeRole(actor: MemberRole, target: MemberRole, next: MemberRole): boolean {
  if (!isAtLeast(actor, "admin")) return false;
  if (target === "owner" || next === "owner") return false;
  return roleRank(actor) > roleRank(target) && roleRank(actor) > roleRank(next);
}

/** Every action flag at once, for rendering a group page. */
export function groupPermissions(ctx: PermissionContext) {
  return {
    read: can(ctx, "group:read"),
    join: can(ctx, "group:join"),
    requestJoin: can(ctx, "group:requestJoin"),
    leave: can(ctx, "group:leave"),
    editSettings: can(ctx, "group:editSettings"),
    post: can(ctx, "post:create"),
    postWithoutApproval: can(ctx, "post:publishWithoutApproval"),
    comment: can(ctx, "comment:create"),
    createEvent: can(ctx, "event:create"),
    moderate: can(ctx, "post:moderate"),
    manage: can(ctx, "group:manage"),
    invite: can(ctx, "invite:create"),
    manageInvites: can(ctx, "invite:manage"),
    announce: can(ctx, "group:announce"),
  };
}
export type GroupPermissions = ReturnType<typeof groupPermissions>;
