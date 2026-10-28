"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { ButtonLink } from "./ui";

/**
 * The root layout isn't re-rendered on navigation, so the count lives in a
 * query: seeded by the server, re-checked every minute and on tab focus, and
 * invalidated whenever something is marked read.
 */
export function NotificationBell({ initialCount }: { initialCount: number }) {
  const trpc = useTRPC();
  const { data: count = initialCount } = useQuery(
    trpc.notification.unreadCount.queryOptions(undefined, {
      initialData: initialCount,
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    }),
  );

  // A quiet count in the accent color: no red badge, nothing that pulses.
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <ButtonLink href="/notifications" variant="ghost" className="gap-1.5 px-2.5" aria-label={label} title={label}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" />
      </svg>
      {count > 0 ? <span className="text-xs font-semibold text-accent">{count > 99 ? "99+" : count}</span> : null}
    </ButtonLink>
  );
}

/** Call after marking notifications read so the bell updates right away. */
export function useRefreshNotificationCount() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(trpc.notification.unreadCount.queryFilter());
}
