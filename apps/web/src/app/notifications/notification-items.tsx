"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRefreshNotificationCount } from "@/components/notification-bell";
import { Button, cx } from "@/components/ui";
import { timeAgo } from "@/lib/time";
import { useTRPC } from "@/trpc/client";

export function NotificationLink({
  id,
  href,
  unread,
  text,
  groupName,
  groupAccent,
  snippet,
  at,
}: {
  id: string;
  href: string;
  unread: boolean;
  text: string;
  groupName: string | null;
  groupAccent: string | null;
  snippet: string | null;
  at: Date;
}) {
  const trpc = useTRPC();
  const refreshCount = useRefreshNotificationCount();
  const markRead = useMutation(trpc.notification.markRead.mutationOptions({ onSuccess: () => refreshCount() }));

  return (
    <Link
      href={href}
      onClick={() => {
        if (unread) markRead.mutate({ ids: [id] });
      }}
      className={cx("flex gap-3 px-4 py-3 transition hover:bg-surface-2", unread && "bg-accent/5")}
    >
      <span
        aria-hidden
        className={cx("mt-1.5 size-2 shrink-0 rounded-full", unread ? "bg-accent" : "bg-transparent")}
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className={cx(unread && "font-medium")}>
          {text}
          {unread ? <span className="sr-only"> (unread)</span> : null}
        </p>
        {snippet ? <p className="mt-0.5 line-clamp-1 text-muted">“{snippet}”</p> : null}
        <p className="mt-1 text-xs text-muted">
          {groupName ? (
            <span style={groupAccent ? { color: groupAccent } : undefined} className="font-medium">
              {groupName}
            </span>
          ) : null}
          {groupName ? " · " : null}
          {timeAgo(at)}
        </p>
      </div>
    </Link>
  );
}

export function MarkAllReadButton() {
  const router = useRouter();
  const trpc = useTRPC();
  const refreshCount = useRefreshNotificationCount();
  const markAll = useMutation(
    trpc.notification.markAllRead.mutationOptions({
      onSuccess: () => {
        void refreshCount();
        router.refresh();
      },
    }),
  );
  return (
    <Button variant="secondary" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
      Mark all as read
    </Button>
  );
}
