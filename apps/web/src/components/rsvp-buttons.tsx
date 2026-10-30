"use client";

import { RSVP_LABELS, RSVP_STATUSES, type RsvpStatus } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { cx } from "./ui";

/** Going / Maybe / Can't go. The current answer is highlighted; a full event disables Going for newcomers. */
export function RsvpButtons({
  eventId,
  current,
  allowed,
}: {
  eventId: string;
  current: RsvpStatus | null;
  allowed: Record<RsvpStatus, boolean>;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const rsvp = useMutation(trpc.event.rsvp.mutationOptions({ onSuccess: () => router.refresh() }));
  // While saving, show the answer being sent.
  const shown = rsvp.isPending ? rsvp.variables.status : current;

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Your RSVP" className="grid grid-cols-3 gap-2">
        {RSVP_STATUSES.map((status) => {
          const selected = shown === status;
          const full = status === "going" && !allowed.going && !selected;
          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!allowed[status] || rsvp.isPending}
              onClick={() => !selected && rsvp.mutate({ eventId, status })}
              className={cx(
                "rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed",
                selected
                  ? "border-accent bg-accent text-accent-fg disabled:opacity-100"
                  : "border-line bg-surface text-fg hover:bg-surface-2 disabled:opacity-50",
              )}
            >
              {full ? "Full" : RSVP_LABELS[status]}
            </button>
          );
        })}
      </div>
      {rsvp.error ? <p className="text-sm text-danger">{errorMessage(rsvp.error)}</p> : null}
    </div>
  );
}
