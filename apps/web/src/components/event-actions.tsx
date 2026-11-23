"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Dialog } from "./dialog";
import { Button, ButtonLink } from "./ui";

/** Edit and Cancel, for the organizer and moderators. */
export function EventActions({ eventId, title, goingCount }: { eventId: string; title: string; goingCount: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation(
    trpc.event.cancel.mutationOptions({
      onSuccess: () => {
        setConfirming(false);
        router.refresh();
      },
    }),
  );

  return (
    <div className="flex gap-2">
      <ButtonLink href={`/e/${eventId}/edit`} variant="secondary">
        Edit
      </ButtonLink>
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Cancel event
      </Button>
      {confirming ? (
        <Dialog title="Cancel this event?" onClose={() => setConfirming(false)}>
          <p className="text-sm text-muted">
            “{title}” stays on the calendar marked as cancelled
            {goingCount > 1 ? `. Everyone who said they're going or maybe gets a notification and an email` : ""}. This can't be undone.
          </p>
          {cancel.error ? <p className="mt-3 text-sm text-danger">{errorMessage(cancel.error)}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button className="bg-danger text-white" disabled={cancel.isPending} onClick={() => cancel.mutate({ eventId })}>
              {cancel.isPending ? "Cancelling…" : "Cancel event"}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
