import { describeNotification, NOTIFICATION_FILTERS, notificationHref, type NotificationFilter } from "@cs/core";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink, cx, EmptyState } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { MarkAllReadButton, NotificationLink } from "./notification-items";

export const metadata: Metadata = { title: "Notifications" };

const tabs: Record<NotificationFilter, { label: string; empty: string }> = {
  all: { label: "All", empty: "When someone comments on your post, replies to you, or an event you're going to changes, it'll show up here." },
  unread: { label: "Unread", empty: "You're all caught up." },
  events: { label: "Events", empty: "Reminders, changes, updates and RSVPs for events you're part of show up here." },
  posts: { label: "Posts", empty: "Comments on your posts and replies to you show up here." },
  groups: { label: "Groups", empty: "Group announcements, polls, and changes to your membership show up here." },
};

function tabHref(filter: NotificationFilter) {
  return filter === "all" ? "/notifications" : `/notifications?filter=${filter}`;
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ cursor?: string; filter?: string }> }) {
  if (!(await getSessionUser())) redirect("/sign-in?next=/notifications");
  const { cursor, filter: rawFilter } = await searchParams;
  const filter = (NOTIFICATION_FILTERS as readonly string[]).includes(rawFilter ?? "") ? (rawFilter as NotificationFilter) : "all";
  const { notifications, nextCursor } = await (await serverApi()).notification.list({ cursor, filter });
  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted">
            Replies, comments and updates meant for you. New posts are on Home.{" "}
            <Link href="/profile#notifications" className="text-accent hover:underline">
              Settings
            </Link>
          </p>
        </div>
        {hasUnread ? <MarkAllReadButton /> : null}
      </div>

      <nav aria-label="Filter notifications" className="flex flex-wrap gap-2">
        {NOTIFICATION_FILTERS.map((f) => (
          <Link
            key={f}
            href={tabHref(f)}
            aria-current={f === filter ? "page" : undefined}
            className={cx(
              "rounded-full border px-3 py-1 text-sm transition",
              f === filter ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface hover:border-accent",
            )}
          >
            {tabs[f].label}
          </Link>
        ))}
      </nav>

      {notifications.length === 0 ? (
        <EmptyState title={cursor ? "Nothing older" : filter === "unread" ? "Nothing unread" : "Nothing yet"}>{tabs[filter].empty}</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {notifications.map((n) => (
            <li key={n.id}>
              <NotificationLink
                id={n.id}
                href={notificationHref(n)}
                unread={!n.readAt}
                text={describeNotification(n)}
                groupName={n.groupName}
                groupAccent={n.groupAccent}
                snippet={n.type === "comment" || n.type === "reply" || n.type === "post_approved" ? n.postSnippet : null}
                at={n.updatedAt}
              />
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <div className="text-center">
          <ButtonLink
            href={`/notifications?${new URLSearchParams({ cursor: nextCursor, ...(filter === "all" ? {} : { filter }) })}`}
            variant="secondary"
          >
            Older
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
