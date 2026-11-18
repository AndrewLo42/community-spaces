import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MemberRole, MembershipStatus } from "./constants";
import {
  can,
  canAcceptInvite,
  canChangeRole,
  canCommentOnPost,
  canEditComment,
  canEditPost,
  canManageEvent,
  canManagePoll,
  canMessageAttendees,
  canModerateMember,
  canReport,
  canRsvp,
  canRemoveContent,
  canTransferOwnership,
  canViewPost,
  canVote,
  pollClosed,
  type GroupRules,
  type PermissionContext,
} from "./permissions";

const openPublic: GroupRules = {
  visibility: "public",
  joinPolicy: "open",
  postPolicy: "members",
  commentPolicy: "members",
  eventPolicy: "members",
  invitePolicy: "admins",
};

function ctx(
  group: Partial<GroupRules> = {},
  membership: { role: MemberRole; status?: MembershipStatus } | null = null,
  userId: string | null = "u1",
): PermissionContext {
  return {
    userId,
    group: { ...openPublic, ...group },
    membership: membership && { role: membership.role, status: membership.status ?? "active" },
  };
}

describe("visibility", () => {
  it("public groups are readable by anyone, including signed-out visitors", () => {
    assert.equal(can(ctx({}, null, null), "group:read"), true);
  });

  it("private groups are discoverable but not readable by non-members", () => {
    const c = ctx({ visibility: "private", joinPolicy: "request" });
    assert.equal(can(c, "group:discover"), true);
    assert.equal(can(c, "group:read"), false);
  });

  it("hidden groups are invisible to non-members", () => {
    const c = ctx({ visibility: "hidden", joinPolicy: "invite" });
    assert.equal(can(c, "group:discover"), false);
    assert.equal(can(c, "group:read"), false);
  });

  it("members can see hidden groups", () => {
    const c = ctx({ visibility: "hidden", joinPolicy: "invite" }, { role: "member" });
    assert.equal(can(c, "group:discover"), true);
    assert.equal(can(c, "group:read"), true);
  });

  it("pending members can't read private groups yet", () => {
    const c = ctx({ visibility: "private" }, { role: "member", status: "pending" });
    assert.equal(can(c, "group:read"), false);
  });
});

describe("joining", () => {
  it("signed-out visitors can't join", () => {
    assert.equal(can(ctx({}, null, null), "group:join"), false);
  });

  it("open groups can be joined directly", () => {
    assert.equal(can(ctx(), "group:join"), true);
    assert.equal(can(ctx(), "group:requestJoin"), false);
  });

  it("request groups need a request", () => {
    const c = ctx({ joinPolicy: "request" });
    assert.equal(can(c, "group:join"), false);
    assert.equal(can(c, "group:requestJoin"), true);
  });

  it("invite-only groups can't be joined or requested", () => {
    const c = ctx({ joinPolicy: "invite" });
    assert.equal(can(c, "group:join"), false);
    assert.equal(can(c, "group:requestJoin"), false);
  });

  it("banned users can't rejoin", () => {
    const c = ctx({}, { role: "member", status: "banned" });
    assert.equal(can(c, "group:join"), false);
    assert.equal(can(c, "post:create"), false);
  });

  it("owners can't leave without transferring ownership", () => {
    assert.equal(can(ctx({}, { role: "owner" }), "group:leave"), false);
    assert.equal(can(ctx({}, { role: "admin" }), "group:leave"), true);
  });
});

describe("posting", () => {
  it("non-members can't post, even in public groups", () => {
    assert.equal(can(ctx(), "post:create"), false);
  });

  it("members can post and publish in 'members' groups", () => {
    const c = ctx({}, { role: "member" });
    assert.equal(can(c, "post:create"), true);
    assert.equal(can(c, "post:publishWithoutApproval"), true);
  });

  it("'approval' groups queue member posts but not moderator posts", () => {
    const member = ctx({ postPolicy: "approval" }, { role: "member" });
    assert.equal(can(member, "post:create"), true);
    assert.equal(can(member, "post:publishWithoutApproval"), false);

    const mod = ctx({ postPolicy: "approval" }, { role: "moderator" });
    assert.equal(can(mod, "post:publishWithoutApproval"), true);
  });

  it("'admins' groups only let admins and the owner post", () => {
    const g = { postPolicy: "admins" as const };
    assert.equal(can(ctx(g, { role: "member" }), "post:create"), false);
    assert.equal(can(ctx(g, { role: "moderator" }), "post:create"), false);
    assert.equal(can(ctx(g, { role: "admin" }), "post:create"), true);
    assert.equal(can(ctx(g, { role: "owner" }), "post:create"), true);
  });
});

describe("commenting", () => {
  it("comment policy is independent of post policy", () => {
    const announcements = ctx({ postPolicy: "admins", commentPolicy: "members" }, { role: "member" });
    assert.equal(can(announcements, "post:create"), false);
    assert.equal(can(announcements, "comment:create"), true);
  });

  it("locked posts only take moderator comments", () => {
    const locked = { locked: true };
    assert.equal(canCommentOnPost(ctx({}, { role: "member" }), locked), false);
    assert.equal(canCommentOnPost(ctx({}, { role: "moderator" }), locked), true);
  });

  it("pending posts can't be commented on, even by moderators", () => {
    const pending = { locked: false, status: "pending" as const };
    assert.equal(canCommentOnPost(ctx({}, { role: "moderator" }), pending), false);
  });
});

describe("editing", () => {
  const post = { authorId: "author", status: "published" as const, locked: false };

  it("only the author edits a post, and not once it's removed", () => {
    assert.equal(canEditPost(ctx({}, { role: "member" }, "author"), post), true);
    assert.equal(canEditPost(ctx({}, { role: "owner" }, "owner"), post), false);
    assert.equal(canEditPost(ctx({}, { role: "member" }, "author"), { ...post, status: "removed" }), false);
  });

  it("authors can edit a pending post they're waiting on", () => {
    assert.equal(canEditPost(ctx({}, { role: "member" }, "author"), { ...post, status: "pending" }), true);
  });

  it("authors who lose access to a private group can't edit there", () => {
    assert.equal(canEditPost(ctx({ visibility: "private" }, null, "author"), post), false);
  });

  it("comments on locked posts are frozen for everyone but moderators", () => {
    const comment = { authorId: "author", status: "visible" as const };
    const locked = { ...post, locked: true };
    assert.equal(canEditComment(ctx({}, { role: "member" }, "author"), comment, post), true);
    assert.equal(canEditComment(ctx({}, { role: "member" }, "author"), comment, locked), false);
    assert.equal(canEditComment(ctx({}, { role: "moderator" }, "author"), comment, locked), true);
    assert.equal(canEditComment(ctx({}, { role: "member" }, "other"), comment, post), false);
  });
});

describe("ownership", () => {
  it("only the owner transfers, and only to another active member", () => {
    const active = { userId: "m", status: "active" as const };
    assert.equal(canTransferOwnership(ctx({}, { role: "owner" }, "o"), active), true);
    assert.equal(canTransferOwnership(ctx({}, { role: "admin" }, "a"), active), false);
    assert.equal(canTransferOwnership(ctx({}, { role: "owner" }, "o"), { userId: "o", status: "active" }), false);
    assert.equal(canTransferOwnership(ctx({}, { role: "owner" }, "o"), { userId: "m", status: "banned" }), false);
  });

  it("only the owner can delete the group", () => {
    assert.equal(can(ctx({}, { role: "owner" }), "group:delete"), true);
    assert.equal(can(ctx({}, { role: "admin" }), "group:delete"), false);
  });
});

describe("reports and invites", () => {
  it("readers can report others' content but not their own", () => {
    assert.equal(canReport(ctx({}, null, "reader"), { authorId: "author" }), true);
    assert.equal(canReport(ctx({}, { role: "member" }, "author"), { authorId: "author" }), false);
    assert.equal(canReport(ctx({}, null, null), { authorId: "author" }), false);
    assert.equal(canReport(ctx({ visibility: "private" }, null, "reader"), { authorId: "author" }), false);
  });

  it("invites work on any join policy and upgrade pending requests, but not bans", () => {
    assert.equal(canAcceptInvite(ctx({ joinPolicy: "invite", visibility: "hidden" })), true);
    assert.equal(canAcceptInvite(ctx({}, { role: "member", status: "pending" })), true);
    assert.equal(canAcceptInvite(ctx({}, { role: "member", status: "banned" })), false);
    assert.equal(canAcceptInvite(ctx({}, { role: "member" })), false);
    assert.equal(canAcceptInvite(ctx({}, null, null)), false);
  });
});

describe("viewing posts", () => {
  const published = { authorId: "author", status: "published" as const };
  const pending = { authorId: "author", status: "pending" as const };
  const removed = { authorId: "author", status: "removed" as const };

  it("published posts follow the group's read rule", () => {
    assert.equal(canViewPost(ctx({}, null, null), published), true);
    assert.equal(canViewPost(ctx({ visibility: "private" }, null), published), false);
  });

  it("pending posts are visible to their author and moderators only", () => {
    assert.equal(canViewPost(ctx({}, { role: "member" }, "author"), pending), true);
    assert.equal(canViewPost(ctx({}, { role: "member" }, "someone"), pending), false);
    assert.equal(canViewPost(ctx({}, { role: "moderator" }, "mod"), pending), true);
  });

  it("removed posts are visible to nobody", () => {
    assert.equal(canViewPost(ctx({}, { role: "owner" }, "author"), removed), false);
  });
});

describe("moderation", () => {
  it("authors and moderators can remove content; other members can't", () => {
    const post = { authorId: "author" };
    assert.equal(canRemoveContent(ctx({}, { role: "member" }, "author"), post), true);
    assert.equal(canRemoveContent(ctx({}, { role: "member" }, "someone"), post), false);
    assert.equal(canRemoveContent(ctx({}, { role: "moderator" }, "mod"), post), true);
  });

  it("members can be removed only by someone who outranks them, never by themselves", () => {
    const member = { userId: "m", role: "member" as const };
    const moderator = { userId: "mod2", role: "moderator" as const };
    assert.equal(canModerateMember(ctx({}, { role: "moderator" }, "mod"), member), true);
    assert.equal(canModerateMember(ctx({}, { role: "moderator" }, "mod"), moderator), false);
    assert.equal(canModerateMember(ctx({}, { role: "admin" }, "a"), moderator), true);
    assert.equal(canModerateMember(ctx({}, { role: "admin" }, "a"), { userId: "o", role: "owner" }), false);
    assert.equal(canModerateMember(ctx({}, { role: "owner" }, "o"), { userId: "o", role: "owner" }), false);
    assert.equal(canModerateMember(ctx({}, { role: "member" }, "x"), member), false);
  });

  it("only admins and the owner manage invites; moderators open the manage page", () => {
    assert.equal(can(ctx({}, { role: "moderator" }), "invite:manage"), false);
    assert.equal(can(ctx({}, { role: "admin" }), "invite:manage"), true);
    assert.equal(can(ctx({}, { role: "moderator" }), "group:manage"), true);
    assert.equal(can(ctx({}, { role: "member" }), "group:manage"), false);
  });

  it("invite links come from admins, or from any member when the group allows it", () => {
    assert.equal(can(ctx({}, { role: "member" }), "invite:create"), false);
    assert.equal(can(ctx({}, { role: "moderator" }), "invite:create"), false);
    assert.equal(can(ctx({}, { role: "admin" }), "invite:create"), true);
    const membersInvite = { invitePolicy: "members" as const, visibility: "hidden" as const, joinPolicy: "invite" as const };
    assert.equal(can(ctx(membersInvite, { role: "member" }), "invite:create"), true);
    assert.equal(can(ctx(membersInvite, { role: "member", status: "pending" }), "invite:create"), false);
    assert.equal(can(ctx(membersInvite, { role: "member", status: "banned" }), "invite:create"), false);
    assert.equal(can(ctx(membersInvite), "invite:create"), false);
    assert.equal(can(ctx(membersInvite, null, null), "invite:create"), false);
    // Seeing and revoking everyone's links stays with admins.
    assert.equal(can(ctx(membersInvite, { role: "member" }), "invite:manage"), false);
  });

  it("role changes require outranking both the target and the new role", () => {
    assert.equal(canChangeRole("owner", "member", "admin"), true);
    assert.equal(canChangeRole("admin", "member", "moderator"), true);
    assert.equal(canChangeRole("admin", "member", "admin"), false);
    assert.equal(canChangeRole("admin", "admin", "member"), false);
    assert.equal(canChangeRole("moderator", "member", "moderator"), false);
    assert.equal(canChangeRole("owner", "owner", "member"), false);
  });
});

describe("events", () => {
  it("members plan events unless the group keeps that to admins", () => {
    assert.equal(can(ctx({}, { role: "member" }), "event:create"), true);
    assert.equal(can(ctx({ eventPolicy: "admins" }, { role: "member" }), "event:create"), false);
    assert.equal(can(ctx({ eventPolicy: "admins" }, { role: "moderator" }), "event:create"), false);
    assert.equal(can(ctx({ eventPolicy: "admins" }, { role: "admin" }), "event:create"), true);
    assert.equal(can(ctx({}, { role: "member", status: "pending" }), "event:create"), false);
    assert.equal(can(ctx({}, null), "event:create"), false);
  });

  it("the organizer and moderators manage an event; other members don't", () => {
    const event = { createdById: "u2" };
    assert.equal(canManageEvent(ctx({}, { role: "member" }, "u2"), event), true);
    assert.equal(canManageEvent(ctx({}, { role: "member" }, "u1"), event), false);
    assert.equal(canManageEvent(ctx({}, { role: "moderator" }, "u1"), event), true);
    // An organizer who left the group can't edit from outside.
    assert.equal(canManageEvent(ctx({}, null, "u2"), event), false);
  });

  it("RSVPs close when an event ends or is cancelled, and Going respects capacity", () => {
    const open = { cancelled: false, ended: false, capacity: null, goingCount: 3 };
    const member = ctx({}, { role: "member" });
    assert.equal(canRsvp(member, open, null, "going"), true);
    assert.equal(canRsvp(ctx({}, null), open, null, "going"), false);
    assert.equal(canRsvp(member, { ...open, ended: true }, null, "maybe"), false);
    assert.equal(canRsvp(member, { ...open, cancelled: true }, null, "maybe"), false);

    const full = { ...open, capacity: 3 };
    assert.equal(canRsvp(member, full, null, "going"), false);
    assert.equal(canRsvp(member, full, "maybe", "going"), false);
    assert.equal(canRsvp(member, full, null, "maybe"), true);
    assert.equal(canRsvp(member, full, "going", "going"), true);
  });
});

describe("announcements", () => {
  it("admins and the owner announce to the whole group", () => {
    assert.equal(can(ctx({}, { role: "member" }), "group:announce"), false);
    assert.equal(can(ctx({}, { role: "moderator" }), "group:announce"), false);
    assert.equal(can(ctx({}, { role: "admin" }), "group:announce"), true);
    assert.equal(can(ctx({}, { role: "owner" }), "group:announce"), true);
  });

  it("an event's organizer and moderators message its attendees until it's over", () => {
    const event = { createdById: "u1", ended: false };
    assert.equal(canMessageAttendees(ctx({}, { role: "member" }, "u1"), event), true);
    assert.equal(canMessageAttendees(ctx({}, { role: "member" }, "u2"), event), false);
    assert.equal(canMessageAttendees(ctx({}, { role: "moderator" }, "u2"), event), true);
    assert.equal(canMessageAttendees(ctx({}, { role: "member" }, "u1"), { ...event, ended: true }), false);
  });
});

describe("polls", () => {
  const open = { closed: false, forEvent: false };
  const outsider = { attending: false, managesEvent: false };

  it("lets active members answer group polls until they close", () => {
    assert.equal(canVote(ctx({}, { role: "member" }), open, outsider), true);
    assert.equal(canVote(ctx({}, { role: "member" }), { ...open, closed: true }, outsider), false);
    assert.equal(canVote(ctx({}, { role: "member", status: "pending" }), open, outsider), false);
    assert.equal(canVote(ctx({}, null), open, outsider), false);
  });

  it("keeps event polls to the people coming and whoever runs the event", () => {
    const poll = { closed: false, forEvent: true };
    assert.equal(canVote(ctx({}, { role: "member" }), poll, outsider), false);
    assert.equal(canVote(ctx({}, { role: "member" }), poll, { attending: true, managesEvent: false }), true);
    assert.equal(canVote(ctx({}, { role: "member" }), poll, { attending: false, managesEvent: true }), true);
  });

  it("lets the author or a moderator close a poll", () => {
    assert.equal(canManagePoll(ctx({}, { role: "member" }, "u1"), { authorId: "u1" }), true);
    assert.equal(canManagePoll(ctx({}, { role: "member" }, "u2"), { authorId: "u1" }), false);
    assert.equal(canManagePoll(ctx({}, { role: "moderator" }, "u2"), { authorId: "u1" }), true);
    assert.equal(canManagePoll(ctx({}, { role: "member" }, "u2"), { authorId: null }), false);
  });

  it("closes at its end time or when closed by hand", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    assert.equal(pollClosed({ closedAt: null, closesAt: null }, now), false);
    assert.equal(pollClosed({ closedAt: null, closesAt: new Date("2026-11-01T13:00:00Z") }, now), false);
    assert.equal(pollClosed({ closedAt: null, closesAt: now }, now), true);
    assert.equal(pollClosed({ closedAt: new Date("2026-10-30T00:00:00Z"), closesAt: null }, now), true);
  });
});
