import {
  MEMBER_ROLES,
  type CommentPolicy,
  type GroupVisibility,
  type JoinPolicy,
  type MemberRole,
  type MembershipStatus,
  type PostPolicy,
} from "./constants";

// Every permission decision in the app goes through this file, so the rules
// live in one place and are covered by permissions.test.ts. The API layer
// loads the group + the viewer's membership and asks `can()`.

export interface GroupRules {
  visibility: GroupVisibility;
  joinPolicy: JoinPolicy;
  postPolicy: PostPolicy;
  commentPolicy: CommentPolicy;
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
  | "member:review" // approve / reject join requests
  | "member:ban";

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

    case "post:moderate":
    case "member:review":
    case "member:ban":
      return isAtLeast(role, "moderator");
  }
}

/** Locked posts only accept comments from moderators and up. */
export function canCommentOnPost(ctx: PermissionContext, post: { locked: boolean }): boolean {
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
    moderate: can(ctx, "post:moderate"),
  };
}
export type GroupPermissions = ReturnType<typeof groupPermissions>;
