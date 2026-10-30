import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeNotification, messageSnippet, notificationHref, type NotificationSummary } from "./notifications";

const base: NotificationSummary = {
  type: "comment",
  actorName: "Maria",
  actorCount: 1,
  groupName: "Riverside Garden",
  groupSlug: "riverside",
  postId: "p1",
  eventId: null,
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
    assert.equal(
      describeNotification({ ...base, type: "event_comment", actorCount: 2, data: { title: "Garden work day" } }),
      "Maria and 1 other commented on Garden work day",
    );
  });

  it("uses the right article for roles", () => {
    const role = (r: string) => describeNotification({ ...base, type: "role_changed", data: { role: r } });
    assert.equal(role("admin"), "You're now an admin of Riverside Garden");
    assert.equal(role("moderator"), "You're now a moderator of Riverside Garden");
    assert.equal(role("member"), "Your role in Riverside Garden changed to member");
    assert.equal(role("owner"), "You're now the owner of Riverside Garden");
  });
});

describe("notification links", () => {
  it("goes to the post, the group, or the manage page", () => {
    assert.equal(notificationHref(base), "/p/p1");
    assert.equal(notificationHref({ ...base, type: "mod_queue" }), "/g/riverside/manage");
    const onEvent = { ...base, postId: null, eventId: "e1" };
    assert.equal(notificationHref({ ...onEvent, type: "event_comment" }), "/e/e1");
    assert.equal(notificationHref({ ...onEvent, type: "reply" }), "/e/e1");
    assert.equal(notificationHref({ ...base, type: "post_declined" }), "/g/riverside");
  });
});

describe("announcements", () => {
  const announcement = { ...base, type: "announcement" as const, postId: null, groupName: "Riverside", data: { snippet: "Gate code changed" } };
  it("reads as the group's message, or an update about an event", () => {
    assert.equal(describeNotification(announcement), "Riverside: Gate code changed");
    assert.equal(notificationHref(announcement), "/g/riverside");
    const update = { ...announcement, eventId: "e1", data: { snippet: "Moved indoors", eventTitle: "Work day" } };
    assert.equal(describeNotification(update), "Update about Work day: Moved indoors");
    assert.equal(notificationHref(update), "/e/e1");
  });

  it("snippets take the first line and trim long ones", () => {
    assert.equal(messageSnippet("Gate code changed\nIt's 4471 now"), "Gate code changed");
    assert.equal(messageSnippet("a".repeat(100), 10), "aaaaaaaaa…");
  });
});
