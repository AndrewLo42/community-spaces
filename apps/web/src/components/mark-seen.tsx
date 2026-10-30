"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useRefreshNotificationCount } from "./notification-bell";

/**
 * Clears the viewer's notifications about what they're looking at (a post, an
 * event, or a group's review queue), and updates the bell if anything changed.
 */
export function MarkSeen(props: { postId: string } | { eventId: string } | { modQueueGroupId: string }) {
  const trpc = useTRPC();
  const refreshCount = useRefreshNotificationCount();
  const { mutate } = useMutation(
    trpc.notification.markSeen.mutationOptions({
      onSuccess: ({ updated }) => {
        if (updated > 0) void refreshCount();
      },
    }),
  );
  const key = "postId" in props ? `p:${props.postId}` : "eventId" in props ? `e:${props.eventId}` : `m:${props.modQueueGroupId}`;

  useEffect(() => {
    mutate(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per target
  }, [key]);

  return null;
}
