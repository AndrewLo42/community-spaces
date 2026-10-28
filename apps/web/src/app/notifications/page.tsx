import { describeNotification, notificationHref } from "@cs/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink, EmptyState } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { MarkAllReadButton, NotificationLink } from "./notification-items";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  if (!(await getSessionUser())) redirect("/sign-in?next=/notifications");
  const { cursor } = await searchParams;
  const { notifications, nextCursor } = await (await serverApi()).notification.list({ cursor });
  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted">Replies, comments and updates meant for you. New posts are on Home.</p>
        </div>
        {hasUnread ? <MarkAllReadButton /> : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState title={cursor ? "Nothing older" : "Nothing yet"}>
          When someone comments on your post or replies to you, it'll show up here.
        </EmptyState>
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
          <ButtonLink href={`/notifications?cursor=${encodeURIComponent(nextCursor)}`} variant="secondary">
            Older
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
