import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeNotification, notificationHref, type NotificationSummary } from "./notifications";

const base: NotificationSummary = {
  type: "comment",
  actorName: "Maria",
  actorCount: 1,
  groupName: "Riverside Garden",
  groupSlug: "riverside",
  postId: "p1",
  data: null,
};

describe("notification wording", () => {
  it("names one actor, then counts the rest", () => {
    assert.equal(describeNotification(base), "Maria commented on your post");
    assert.equal(describeNotification({ ...base, actorCount: 2 }), "Maria and 1 other commented on your post");
    assert.equal(describeNotification({ ...base, actorCount: 4 }), "Maria and 3 others commented on your post");
  });

  it("falls back when the actor has no name", () => {
    assert.equal(describeNotification({ ...base, actorName: "" }), "Someone commented on your post");
  });

  it("uses the right article for roles", () => {
    const role = (r: string) => describeNotification({ ...base, type: "role_changed", data: { role: r } });
    assert.equal(role("admin"), "You're now an admin of Riverside Garden");
    assert.equal(role("moderator"), "You're now a moderator of Riverside Garden");
    assert.equal(role("member"), "Your role in Riverside Garden changed to member");
  });
});

describe("notification links", () => {
  it("goes to the post, the group, or the manage page", () => {
    assert.equal(notificationHref(base), "/p/p1");
    assert.equal(notificationHref({ ...base, type: "mod_queue" }), "/g/riverside/manage");
    assert.equal(notificationHref({ ...base, type: "post_declined" }), "/g/riverside");
  });
});
