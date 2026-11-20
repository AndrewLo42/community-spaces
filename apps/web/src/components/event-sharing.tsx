"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Button } from "./ui";

/**
 * For the organizer of an event in a private or secret group: a link people
 * outside the group can open. Turning it off makes every copy of it stop working.
 */
export function EventSharing({
  eventId,
  code,
  showLocation,
  groupVisibility,
}: {
  eventId: string;
  code: string | null;
  showLocation: boolean;
  groupVisibility: "public" | "private" | "hidden";
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirmingOff, setConfirmingOff] = useState(false);
  const save = useMutation(
    trpc.event.setSharing.mutationOptions({
      onSuccess: () => {
        setConfirmingOff(false);
        router.refresh();
      },
    }),
  );
  const on = code !== null;
  const shownLocation = save.isPending ? save.variables.showLocation : showLocation;

  return (
    <section className="w-full space-y-3 rounded-lg border border-line p-4 text-sm" aria-labelledby="event-sharing-title">
      <div className="space-y-1">
        <h3 id="event-sharing-title" className="font-semibold">
          Share outside the group {on ? <span className="ml-1 rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">On</span> : null}
        </h3>
        <p className="text-muted">
          {on
            ? "Anyone with the event's link can see it. They won't see the group's posts, the comments here, or who's coming."
            : "Right now only members can open this event. Turn on a link to invite friends who aren't in the group."}
          {groupVisibility === "hidden" ? " The shared page won't name the group or who planned it." : ""}
        </p>
      </div>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={shownLocation}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ eventId, enabled: on, showLocation: e.target.checked })}
        />
        <span>
          Show where it is on the shared page
          <span className="block text-xs text-muted">Turn this off for a home address; members still see it.</span>
        </span>
      </label>

      {save.error ? <p className="text-danger">{errorMessage(save.error)}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {!on ? (
          <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ eventId, enabled: true, showLocation })}>
            Turn on link sharing
          </Button>
        ) : confirmingOff ? (
          <>
            <span className="text-muted">Links already sent will stop working.</span>
            <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ eventId, enabled: false, showLocation })}>
              Turn it off
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingOff(false)}>
              Keep it on
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmingOff(true)}>
            Turn off link sharing
          </Button>
        )}
      </div>
    </section>
  );
}
