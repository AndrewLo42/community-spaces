import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MemberRole, MembershipStatus } from "./constants";
import {
  can,
  canChangeRole,
  canCommentOnPost,
  canRemoveContent,
  canViewPost,
  type GroupRules,
  type PermissionContext,
} from "./permissions";

const openPublic: GroupRules = {
  visibility: "public",
  joinPolicy: "open",
  postPolicy: "members",
  commentPolicy: "members",
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

  it("role changes require outranking both the target and the new role", () => {
    assert.equal(canChangeRole("owner", "member", "admin"), true);
    assert.equal(canChangeRole("admin", "member", "moderator"), true);
    assert.equal(canChangeRole("admin", "member", "admin"), false);
    assert.equal(canChangeRole("admin", "admin", "member"), false);
    assert.equal(canChangeRole("moderator", "member", "moderator"), false);
    assert.equal(canChangeRole("owner", "owner", "member"), false);
  });
});
